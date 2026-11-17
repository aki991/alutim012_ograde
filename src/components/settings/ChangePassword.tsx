import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../services/auth';
import { changeOwnPassword } from '../../services/teamAccounts';
import { Modal } from '../ui/Modal';

/** Promena sopstvene lozinke (na profilu). Nova lozinka važi i u Stolariji, jer je nalog zajednički. */
export function ChangePasswordButton({ label = 'Promeni lozinku', className = 'btn btn-sm mt-1', testId = 'btn-change-password' }: { label?: string; className?: string; testId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} data-testid={testId} onClick={() => setOpen(true)}><KeyRound size={14} />{label}</button>
      {open && <ChangePasswordDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const auth = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const save = async () => {
    if (busy) return;
    setError(null);
    if (!current || !next) { setError('Unesite trenutnu i novu lozinku.'); return; }
    if (next.length < 8) { setError('Nova lozinka mora imati najmanje 8 znakova.'); return; }
    if (next !== repeat) { setError('Ponovljena lozinka se ne poklapa sa novom.'); return; }
    const id = auth.session?.user.id;
    if (!id) { setError('Ponovo se prijavite da biste promenili lozinku.'); return; }
    setBusy(true);
    try {
      await changeOwnPassword(id, current, next);
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const type = show ? 'text' : 'password';
  return (
    <Modal
      title="Promeni lozinku"
      onClose={() => { if (!busy) onClose(); }}
      footer={done
        ? <button className="btn btn-primary" onClick={onClose}>Zatvori</button>
        : <><button className="btn" disabled={busy} onClick={onClose}>Otkaži</button><button className="btn btn-primary" disabled={busy} data-testid="password-save" onClick={() => void save()}>{busy ? <Loader2 size={16} className="animate-spin" /> : null}Sačuvaj lozinku</button></>}
    >
      {done ? (
        <p role="status" className="text-sm text-[#067647]" data-testid="password-done">Lozinka je promenjena. Nova lozinka važi u Ogradama i u Stolariji.</p>
      ) : (
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
          <label className="grid gap-1"><span className="label">Trenutna lozinka</span>
            <input className="input" type={type} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" data-autofocus data-testid="password-current" />
          </label>
          <label className="grid gap-1"><span className="label">Nova lozinka (najmanje 8 znakova)</span>
            <input className="input" type={type} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" data-testid="password-new" />
          </label>
          <label className="grid gap-1"><span className="label">Ponovite novu lozinku</span>
            <input className="input" type={type} value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" data-testid="password-repeat" />
          </label>
          <button type="button" className="text-[12.5px] text-slate-600 inline-flex items-center gap-1.5 justify-self-start" onClick={() => setShow((v) => !v)}>
            {show ? <EyeOff size={14} /> : <Eye size={14} />}{show ? 'Sakrij lozinke' : 'Prikaži lozinke'}
          </button>
          {error && <p role="alert" className="text-[13px] text-[#b42318] rounded-md bg-[#fef3f2] border border-[#fecdca] px-3 py-2" data-testid="password-error">{error}</p>}
          <button type="submit" hidden />
        </form>
      )}
    </Modal>
  );
}
