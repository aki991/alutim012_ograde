import { Eye, EyeOff, Link2, Loader2, Pencil, Trash2, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../services/auth';
import { displayLogin } from '../../services/loginName';
import { changeAccount, fetchAccounts, ROLE_LABEL, type StaffRole, type TeamAccount } from '../../services/teamAccounts';
import { ConfirmDialog, Modal } from '../ui/Modal';
import { ChangePasswordButton } from './ChangePassword';

const ROLE_PILL: Record<TeamAccount['role'], string> = {
  admin: 'bg-[#fde4e4] text-[#b4141b]',
  manager: 'bg-[#fff4d6] text-[#8a5a00]',
  worker: 'bg-slate-100 text-slate-700',
};

const loginOf = (a: TeamAccount) => displayLogin(a.email) ?? '—';

function RolePicker({ value, onChange, testId }: { value: StaffRole; onChange: (v: StaffRole) => void; testId: string }) {
  return (
    <label className="grid gap-1"><span className="label">Uloga</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value as StaffRole)} data-testid={testId}>
        <option value="worker">Majstor</option>
        <option value="manager">Šef</option>
      </select>
    </label>
  );
}

/**
 * Nalozi zaposlenih (šef i administrator). Isti nalozi i uloge kao u Stolariji: spisak dolazi iz
 * field_team_list_accounts, a izmene idu kroz serversku funkciju field-team-accounts.
 * Šef pri pravljenju naloga postavlja početnu lozinku; posle toga lozinku menja vlasnik naloga na svom profilu.
 */
export function UsersAdmin() {
  const auth = useAuth();
  const myId = auth.session?.user.id ?? null;
  const [accounts, setAccounts] = useState<TeamAccount[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<'create' | 'link'>('create');
  const [identifier, setIdentifier] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<StaffRole>('worker');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<TeamAccount | null>(null);
  const [deleting, setDeleting] = useState<TeamAccount | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setAccounts(await fetchAccounts());
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const login = identifier.trim();
    try {
      if (mode === 'create') {
        await changeAccount({ action: 'create', identifier: login, name: name.trim(), password, role });
        setMessage({ ok: true, text: `Nalog „${login}" (${ROLE_LABEL[role]}) je napravljen. Prijavljuje se tim podacima u Ogradama i Stolariji.` });
      } else {
        await changeAccount({ action: 'link', identifier: login, role });
        setMessage({ ok: true, text: `Postojeći nalog „${login}" je dobio ulogu: ${ROLE_LABEL[role]}.` });
      }
      setIdentifier(''); setName(''); setPassword(''); setShow(false);
      await load();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (a: TeamAccount) => {
    setDeleting(null);
    setMessage(null);
    try {
      await changeAccount({ action: 'delete', id: a.id });
      setMessage({ ok: true, text: `Nalog „${loginOf(a)}" je obrisan.` });
      await load();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    }
  };

  return (
    <section className="card p-5 lg:col-span-2" data-testid="users-admin">
      <h2 className="font-bold mb-1">Nalozi zaposlenih</h2>
      <p className="text-sm text-muted mb-4">Isti nalozi i uloge važe u Ogradama i u Stolariji. Šef pravi naloge za šefove i majstore i postavlja im početnu lozinku; posle toga svako menja svoju lozinku sam: dugme „Lozinka“ u svom redu ovde ili Podešavanja → Firma i korisnik → Promeni lozinku.</p>

      <div className="flex gap-1 mb-3" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'create'} className={`btn btn-sm ${mode === 'create' ? 'btn-primary' : ''}`} data-testid="user-mode-create" onClick={() => setMode('create')}><UserPlus size={14} />Novi nalog</button>
        <button type="button" role="tab" aria-selected={mode === 'link'} className={`btn btn-sm ${mode === 'link' ? 'btn-primary' : ''}`} data-testid="user-mode-link" onClick={() => setMode('link')}><Link2 size={14} />Postojeći nalog</button>
      </div>

      <form className={`grid gap-3 items-end ${mode === 'create' ? 'md:grid-cols-[1fr_1fr_1fr_150px_auto]' : 'md:grid-cols-[1fr_150px_auto]'}`} onSubmit={(e) => void submit(e)} data-testid="user-create-form" noValidate>
        <label className="grid gap-1"><span className="label">Korisničko ime ili e-mail</span>
          <input className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="npr. petar.petrovic" data-testid="user-new-login" />
        </label>
        {mode === 'create' && (
          <>
            <label className="grid gap-1"><span className="label">Ime i prezime</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder="npr. Petar Petrović" data-testid="user-new-name" />
            </label>
            <label className="grid gap-1"><span className="label">Početna lozinka (najmanje 8 znakova)</span>
              <span className="relative block">
                <input className="input !pr-10" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" data-testid="user-new-password" />
                <button type="button" className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-ink rounded-md" aria-label={show ? 'Sakrij lozinku' : 'Prikaži lozinku'} tabIndex={-1} onClick={() => setShow((v) => !v)}>
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>
          </>
        )}
        <RolePicker value={role} onChange={setRole} testId="user-new-role" />
        <button type="submit" className="btn btn-primary" disabled={busy} data-testid="user-create">
          {busy ? <Loader2 size={17} className="animate-spin" /> : mode === 'create' ? <UserPlus size={17} /> : <Link2 size={17} />}
          {mode === 'create' ? 'Napravi nalog' : 'Dodeli ulogu'}
        </button>
      </form>
      {mode === 'link' && <p className="text-[12px] text-muted mt-2">Za nalog koji već postoji (npr. napravljen ranije u Ogradama) a još nema ulogu u timu. Lozinka ostaje ista.</p>}
      {message && <p role={message.ok ? 'status' : 'alert'} className={`text-[13px] mt-3 rounded-md px-3 py-2 ${message.ok ? 'bg-[#ecfdf3] text-[#067647] border border-[#abefc6]' : 'bg-[#fef3f2] text-[#b42318] border border-[#fecdca]'}`} data-testid="user-message">{message.text}</p>}

      <div className="mt-5 overflow-x-auto">
        {loadError ? (
          <p className="text-sm text-[#b42318]" role="alert" data-testid="users-error">{loadError}</p>
        ) : accounts === null ? (
          <p className="text-sm text-muted" data-testid="users-loading">Učitavanje naloga…</p>
        ) : (
          <table className="w-full min-w-[560px]" data-testid="users-table">
            <thead><tr><th className="th">Prijava</th><th className="th">Ime i prezime</th><th className="th">Uloga</th><th className="th text-right">Radnje</th></tr></thead>
            <tbody>
              {accounts.map((a) => {
                const self = a.id === myId;
                // administratora menja samo administrator (baza to ionako proverava)
                const locked = a.role === 'admin' && auth.role !== 'admin';
                return (
                  <tr key={a.id} data-testid="user-row">
                    <td className="td font-medium">{loginOf(a)}{self && <span className="ml-2 text-[11px] text-muted font-normal">(vi)</span>}</td>
                    <td className="td">{a.name || '—'}</td>
                    <td className="td"><span className={`pill !py-0 !px-2 !text-[11px] ${ROLE_PILL[a.role]}`} data-testid="user-row-role">{ROLE_LABEL[a.role]}</span></td>
                    <td className="td">
                      <span className="flex justify-end gap-1.5">
                        {/* sopstvena lozinka se menja odmah ovde (i u Podešavanjima → Firma i korisnik) */}
                        {self && <ChangePasswordButton label="Lozinka" className="btn btn-sm" testId="user-own-password" />}
                        <button className="btn btn-sm" aria-label={`Izmeni nalog ${loginOf(a)}`} data-testid="user-edit" disabled={locked} onClick={() => setEditing(a)}><Pencil size={14} />Izmeni</button>
                        <button className="btn btn-sm btn-danger" aria-label={`Obriši nalog ${loginOf(a)}`} data-testid="user-delete" disabled={self || a.role === 'admin'} title={self ? 'Sopstveni nalog ne možete obrisati' : undefined} onClick={() => setDeleting(a)}><Trash2 size={14} />Obriši</button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <EditAccount
          account={editing}
          isAdmin={auth.role === 'admin'}
          onClose={() => setEditing(null)}
          onSaved={async (text) => { setEditing(null); setMessage({ ok: true, text }); await load(); if (editing.id === myId) await auth.refreshProfile(); }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Brisanje naloga" danger confirmLabel="Obriši"
          message={<>Nalog <b>{loginOf(deleting)}</b>{deleting.name ? ` (${deleting.name})` : ''} više neće moći da se prijavi ni u Ograde ni u Stolariju. Sačuvani poslovi ostaju. Ovo se ne može poništiti.</>}
          onCancel={() => setDeleting(null)} onConfirm={() => void remove(deleting)}
        />
      )}
    </section>
  );
}

/** Izmena profila: ime i prezime i korisničko ime. Stvarnu e-mail adresu menja samo administrator (proverava server). */
function EditAccount({ account, isAdmin, onClose, onSaved }: {
  account: TeamAccount; isAdmin: boolean; onClose: () => void; onSaved: (text: string) => void | Promise<void>;
}) {
  const original = loginOf(account);
  const [login, setLogin] = useState(original);
  const [name, setName] = useState(account.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const realEmail = !!account.email && !account.email.endsWith('@alutim012.local');
  const loginLocked = realEmail && !isAdmin;

  const save = async () => {
    const nextLogin = login.trim();
    if (name.trim() === account.name && nextLogin.toLowerCase() === original.toLowerCase()) { onClose(); return; }
    setBusy(true);
    setError(null);
    try {
      await changeAccount({ action: 'update', id: account.id, name: name.trim(), ...(nextLogin.toLowerCase() !== original.toLowerCase() ? { identifier: nextLogin } : {}) });
      await onSaved(`Izmene za nalog „${nextLogin || original}" su sačuvane.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Izmena naloga: ${original}`}
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Otkaži</button><button className="btn btn-primary" disabled={busy} data-testid="user-edit-save" onClick={() => void save()}>{busy ? <Loader2 size={16} className="animate-spin" /> : null}Sačuvaj</button></>}
    >
      <div className="grid gap-3" data-testid="user-edit-form" onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); void save(); } }}>
        <label className="grid gap-1"><span className="label">Ime i prezime</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} data-autofocus data-testid="user-edit-name" />
        </label>
        <label className="grid gap-1"><span className="label">Korisničko ime ili e-mail</span>
          <input className="input" value={login} onChange={(e) => setLogin(e.target.value)} disabled={loginLocked} autoCapitalize="none" spellCheck={false} data-testid="user-edit-login" />
          {loginLocked && <span className="text-[12px] text-muted">Stvarnu e-mail adresu za prijavu menja samo administrator.</span>}
        </label>
        <p className="text-[12px] text-muted">Ulogu i lozinku ovde ne menjate: lozinku menja vlasnik naloga (dugme „Lozinka“ u svom redu ili Podešavanja → Firma i korisnik → Promeni lozinku).</p>
        {error && <p role="alert" className="text-[13px] text-[#b42318] rounded-md bg-[#fef3f2] border border-[#fecdca] px-3 py-2" data-testid="user-edit-error">{error}</p>}
      </div>
    </Modal>
  );
}
