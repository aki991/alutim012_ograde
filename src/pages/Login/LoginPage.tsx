import { Eye, EyeOff, Loader2, LogIn, WifiOff } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogoMark } from '../../components/layout/Logo';
import { useAuth } from '../../services/auth';

/** Prijava: samo email i lozinka (nalozi se prave u Supabase-u; nema samostalne registracije). */
export default function LoginPage() {
  const { enabled, signIn, enterGuest } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [netFail, setNetFail] = useState(false);
  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  // ulaz bez prijave nudi se samo kad nema veze (ili server ne odgovara): sa internetom se prijava traži uvek
  const offline = enabled && (!online || netFail);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) { setError('Unesite email i lozinku.'); return; }
    setBusy(true);
    setError(null);
    const err = await signIn(email, password);
    setBusy(false);
    setNetFail(err !== null && err.startsWith('Nema veze'));
    if (err) { setError(err); setPassword(''); }
  };

  return (
    <div className="min-h-full brand-bg grid place-items-center px-4 py-10" data-testid="login-page">
      <div className="w-full max-w-[420px]">
        <div className="flex justify-center mb-7">
          <LogoMark size={150} />
        </div>

        <form className="card p-7 shadow-2xl" onSubmit={(e) => void submit(e)} noValidate data-testid="login-form">
          <h1 className="text-[22px] font-bold">Prijava</h1>
          <p className="text-sm text-muted mt-1 mb-5">Projektovanje ograda i kapija po meri</p>

          {!enabled && (
            <div className="rounded-lg bg-[#fffaeb] border border-[#fedf89] text-[#93370d] text-[13px] px-3 py-2.5 mb-4" role="status" data-testid="login-disabled">
              Prijava još nije podešena: nedostaju <code>VITE_SUPABASE_URL</code> i <code>VITE_SUPABASE_ANON_KEY</code>. Aplikacija radi bez prijave.
              <button type="button" className="btn btn-sm mt-2 w-full" onClick={() => navigate('/')}>Nastavi bez prijave</button>
            </div>
          )}

          <label className="grid gap-1 mb-3">
            <span className="label">Email</span>
            <input
              className="input !py-2.5" type="email" name="email" autoComplete="username" inputMode="email" autoFocus
              value={email} onChange={(e) => setEmail(e.target.value)} disabled={!enabled} aria-invalid={Boolean(error)} data-testid="login-email"
            />
          </label>
          <label className="grid gap-1 mb-4">
            <span className="label">Lozinka</span>
            <span className="relative block">
              <input
                className="input !py-2.5 !pr-11" type={show ? 'text' : 'password'} name="password" autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)} disabled={!enabled} aria-invalid={Boolean(error)} data-testid="login-password"
              />
              <button type="button" className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-ink rounded-md" aria-label={show ? 'Sakrij lozinku' : 'Prikaži lozinku'} aria-pressed={show} onClick={() => setShow((v) => !v)} tabIndex={-1}>
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>

          {error && <p className="text-[13px] text-[#b42318] rounded-md bg-[#fef3f2] border border-[#fecdca] px-3 py-2 mb-4" role="alert" data-testid="login-error">{error}</p>}

          <button type="submit" className="btn btn-primary w-full !py-3 text-[15px]" disabled={busy || !enabled} data-testid="login-submit">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}{busy ? 'Prijavljivanje…' : 'Prijavi se'}
          </button>
          {offline && (
            <div className="mt-4 pt-4 border-t border-line" data-testid="guest-box">
              <button type="button" className="btn w-full" onClick={enterGuest} data-testid="btn-guest"><WifiOff size={17} />Nastavi bez interneta (gost)</button>
              <p className="text-[12px] text-muted text-center mt-2">Radi se sa podacima sačuvanim u ovom pregledaču. Prijava se traži pri sledećem pokretanju.</p>
            </div>
          )}
          <p className="text-[12px] text-muted text-center mt-4">Nalog dobijate od administratora.</p>
        </form>
      </div>
    </div>
  );
}
