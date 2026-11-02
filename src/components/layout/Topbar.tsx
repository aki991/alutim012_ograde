import { Bell, ChevronDown, FileDown, Menu, Calculator } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppStore, useCurrentProject } from '../../store/useAppStore';
import { PdfPreviewModal } from '../editor/PdfPreviewModal';
import { useAuth } from '../../services/auth';

function useOutside(ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, close]);
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const inEditor = pathname.startsWith('/editor');
  const customers = useAppStore((s) => s.customers);
  const materials = useAppStore((s) => s.materials);
  const settings = useAppStore((s) => s.settings);
  const current = useCurrentProject();
  const [bell, setBell] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const auth = useAuth();
  const [user, setUser] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  useOutside(bellRef, () => setBell(false));
  useOutside(userRef, () => setUser(false));

  const initials = settings.userName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <header className="h-[69px] shrink-0 brand-bg text-white border-b border-black/20 flex items-center gap-3 px-4 lg:px-6">
      <span className="lg:hidden"><button className="btn btn-icon !text-ink" aria-label="Otvori meni" onClick={onMenu}><Menu size={20} /></button></span>
      <div className="ml-auto flex items-center gap-2">
        {inEditor && current ? (
          <>
            <span className="hidden md:inline-flex">
              <button className="btn" data-testid="btn-pdf" onClick={() => setPdfOpen(true)}><FileDown size={17} />PDF ponuda</button>
            </span>
            <button className="btn btn-accent" data-testid="btn-calc" onClick={() => window.dispatchEvent(new CustomEvent('open-calc'))}><Calculator size={17} /><span className="hidden sm:inline">Izračunaj cenu</span></button>
          </>
        ) : null}

        <div className="relative" ref={bellRef}>
          <button className="btn btn-icon !border-transparent !bg-transparent !text-white hover:!bg-white/10 relative" aria-label="Obaveštenja" onClick={() => { setBell((b) => !b); setUser(false); }}>
            <Bell size={20} />
          </button>
          {bell && (
            <div className="absolute right-0 mt-2 w-[320px] card p-3 z-50" role="menu">
              <div className="px-2 py-3 text-sm text-center text-slate-600" data-testid="bell-empty">Nema obaveštenja.</div>
            </div>
          )}
        </div>

        <div className="relative" ref={userRef}>
          <button className="flex items-center gap-1 pl-1" aria-label="Korisnički meni" onClick={() => { setUser((b) => !b); setBell(false); }}>
            <span className="w-10 h-10 rounded-full bg-accent text-brand-black grid place-items-center text-sm font-bold">{initials || 'ND'}</span>
            <ChevronDown size={16} className="text-white/80 hidden sm:block" />
          </button>
          {user && (
            <div className="absolute right-0 mt-2 w-[220px] card p-2 z-50" role="menu">
              <div className="px-3 py-2 text-sm"><div className="font-semibold">{settings.userName}</div><div className="text-muted text-xs">{settings.companyName}</div>{auth.email && <div className="text-muted text-xs truncate" data-testid="user-email">{auth.email}</div>}</div>
              <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-sm" onClick={() => { setUser(false); navigate('/podesavanja'); }}>Podešavanja</button>
              <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-sm" onClick={() => { setUser(false); navigate('/pomoc'); }}>Pomoć</button>
              {auth.enabled && <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-sm text-[#b42318]" data-testid="btn-logout" onClick={() => { setUser(false); void auth.signOut(); }}>Odjavi se</button>}
            </div>
          )}
        </div>
      </div>
      {pdfOpen && current && <PdfPreviewModal project={current} customer={customers.find((c) => c.id === current.customerId) ?? null} materials={materials} settings={settings} onClose={() => setPdfOpen(false)} />}
    </header>
  );
}
