import { Eye, EyeOff, Loader2, Pencil, Trash2, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../services/auth';
import { ConfirmDialog, Modal } from '../ui/Modal';

interface AppUser { id: string; login: string; fullName: string; role: string | null; createdAt: string; lastSignInAt: string | null }
type Result = { ok: boolean; status: number; body: Record<string, unknown> };

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('sr-Latn-RS', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const errorOf = (r: Result, fallback: string) => (typeof r.body.error === 'string' ? r.body.error : fallback);

/** Korisnici aplikacije (samo administrator): spisak, pravljenje, izmena i brisanje naloga. Radi preko servera (api/users), jer to traži tajni ključ. */
export function UsersAdmin() {
  const auth = useAuth();
  const myId = auth.session?.user.id ?? null;
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [login, setLogin] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [deleting, setDeleting] = useState<AppUser | null>(null);

  const call = useCallback(async (init?: RequestInit, search = ''): Promise<Result> => {
    const token = await auth.getToken();
    const res = await fetch(`/api/users${search}`, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${token ?? ''}` } });
    let body: Record<string, unknown> = {};
    try { body = (await res.json()) as Record<string, unknown>; } catch { /* odgovor nije JSON (npr. funkcija nije dostupna) */ }
    return { ok: res.ok, status: res.status, body };
  }, [auth]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const r = await call();
      // bez pokrenute serverske funkcije (npr. lokalno) stiže stranica aplikacije, a ne spisak
      if (!r.ok || !Array.isArray(r.body.users)) { setLoadError(errorOf(r, 'Spisak korisnika nije dostupan (funkcija na serveru nije pokrenuta).')); return; }
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
        setMessage({ ok: false, text: errorOf(r, 'Korisnik nije napravljen.') });
      }
    } catch {
      setMessage({ ok: false, text: 'Nema veze sa serverom.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (u: AppUser) => {
    setDeleting(null);
    setMessage(null);
    try {
      const r = await call({ method: 'DELETE' }, `?id=${encodeURIComponent(u.id)}`);
      setMessage(r.ok ? { ok: true, text: `Korisnik „${u.login}" je obrisan.` } : { ok: false, text: errorOf(r, 'Korisnik nije obrisan.') });
      if (r.ok) await load();
    } catch {
      setMessage({ ok: false, text: 'Nema veze sa serverom.' });
    }
  };

  return (
    <section className="card p-5 lg:col-span-2" data-testid="users-admin">
      <h2 className="font-bold mb-1">Korisnici</h2>
      <p className="text-sm text-muted mb-4">Samo administrator pravi i menja naloge. Korisnik se prijavljuje korisničkim imenom (ili e-mailom) i lozinkom koje ovde unesete; novi nalog nema ovlašćenja administratora.</p>

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
          <table className="w-full min-w-[640px]" data-testid="users-table">
            <thead><tr><th className="th">Prijava</th><th className="th">Ime i prezime</th><th className="th">Uloga</th><th className="th">Napravljen</th><th className="th">Poslednja prijava</th><th className="th text-right">Radnje</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} data-testid="user-row">
                  <td className="td font-medium">{u.login}{u.id === myId && <span className="ml-2 text-[11px] text-muted font-normal">(vi)</span>}</td>
                  <td className="td">{u.fullName || '—'}</td>
                  <td className="td">{u.role === 'admin' ? <span className="pill !py-0 !px-2 !text-[11px] bg-[#fde4e4] text-[#b4141b]">Administrator</span> : <span className="text-muted">—</span>}</td>
                  <td className="td tabular-nums text-slate-600">{fmt(u.createdAt)}</td>
                  <td className="td tabular-nums text-slate-600">{fmt(u.lastSignInAt)}</td>
                  <td className="td">
                    <span className="flex justify-end gap-1.5">
                      <button className="btn btn-sm" aria-label={`Izmeni korisnika ${u.login}`} data-testid="user-edit" onClick={() => setEditing(u)}><Pencil size={14} />Izmeni</button>
                      <button className="btn btn-sm btn-danger" aria-label={`Obriši korisnika ${u.login}`} data-testid="user-delete" disabled={u.id === myId} title={u.id === myId ? 'Sopstveni nalog ne možete obrisati' : undefined} onClick={() => setDeleting(u)}><Trash2 size={14} />Obriši</button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <EditUser
          user={editing}
          self={editing.id === myId}
          call={call}
          onClose={() => setEditing(null)}
          onSaved={async (text) => { setEditing(null); setMessage({ ok: true, text }); await load(); }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Brisanje korisnika" danger confirmLabel="Obriši"
          message={<>Korisnik <b>{deleting.login}</b>{deleting.fullName ? ` (${deleting.fullName})` : ''} više neće moći da se prijavi. Podaci u njegovom pregledaču (projekti, kupci) ostaju tamo. Ovo se ne može poništiti.</>}
          onCancel={() => setDeleting(null)} onConfirm={() => void remove(deleting)}
        />
      )}
    </section>
  );
}

/** Izmena naloga: ime i prezime, korisničko ime/e-mail, nova lozinka (prazno = ne menja se) i uloga. */
function EditUser({ user, self, call, onClose, onSaved }: {
  user: AppUser; self: boolean; call: (init?: RequestInit, search?: string) => Promise<Result>; onClose: () => void; onSaved: (text: string) => void | Promise<void>;
}) {
  const [login, setLogin] = useState(user.login);
  const [fullName, setFullName] = useState(user.fullName);
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [admin, setAdmin] = useState(user.role === 'admin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const body: Record<string, unknown> = { id: user.id };
    if (login.trim() && login.trim().toLowerCase() !== user.login.toLowerCase()) body.login = login.trim();
    if (fullName.trim() !== user.fullName) body.fullName = fullName.trim();
    if (password) body.password = password;
    if (admin !== (user.role === 'admin')) body.role = admin ? 'admin' : 'user';
    if (Object.keys(body).length === 1) { onClose(); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await call({ method: 'PATCH', body: JSON.stringify(body) });
      if (r.ok) await onSaved(`Izmene za korisnika „${login.trim() || user.login}" su sačuvane.${body.password ? ' Nova lozinka važi odmah.' : ''}`);
      else setError(errorOf(r, 'Izmena nije sačuvana.'));
    } catch {
      setError('Nema veze sa serverom.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Izmena korisnika: ${user.login}`}
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Otkaži</button><button className="btn btn-primary" disabled={busy} data-testid="user-edit-save" onClick={() => void save()}>{busy ? <Loader2 size={16} className="animate-spin" /> : null}Sačuvaj</button></>}
    >
      <div className="grid gap-3" data-testid="user-edit-form" onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); void save(); } }}>
        <label className="grid gap-1"><span className="label">Korisničko ime ili e-mail</span>
          <input className="input" value={login} onChange={(e) => setLogin(e.target.value)} disabled={self} autoCapitalize="none" spellCheck={false} data-testid="user-edit-login" />
          {self && <span className="text-[12px] text-muted">Sopstvenu prijavu ne možete menjati ovde.</span>}
        </label>
        <label className="grid gap-1"><span className="label">Ime i prezime</span>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} data-autofocus data-testid="user-edit-name" />
        </label>
        <label className="grid gap-1"><span className="label">Nova lozinka (prazno = ostaje ista)</span>
          <span className="relative block">
            <input className="input !pr-10" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="najmanje 8 znakova" data-testid="user-edit-password" />
            <button type="button" className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-ink rounded-md" aria-label={show ? 'Sakrij lozinku' : 'Prikaži lozinku'} tabIndex={-1} onClick={() => setShow((v) => !v)}>
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} disabled={self} data-testid="user-edit-admin" />
          Administrator (može da pravi, menja i briše korisnike)
        </label>
        {self && <span className="text-[12px] text-muted -mt-2">Sebi ne možete oduzeti ulogu administratora.</span>}
        {error && <p role="alert" className="text-[13px] text-[#b42318] rounded-md bg-[#fef3f2] border border-[#fecdca] px-3 py-2" data-testid="user-edit-error">{error}</p>}
      </div>
    </Modal>
  );
}
