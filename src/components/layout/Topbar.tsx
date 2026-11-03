import { Bell, Building2, ChevronDown, CircleHelp, LogOut, Menu, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { useAuth } from '../../services/auth';
import { initialsOf } from '../../utils/units';

function useOutside(ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, close]);
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const navigate = useNavigate();
  const settings = useAppStore((s) => s.settings);
  const [bell, setBell] = useState(false);
  const auth = useAuth();
  const [user, setUser] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  useOutside(bellRef, () => setBell(false));
  useOutside(userRef, () => setUser(false));

  // prijavljen korisnik: ime iz naloga, a ako ga nema deo emaila; bez prijave ostaje lokalno ime iz podešavanja
  const displayName = auth.guest ? 'Gost' : auth.enabled ? (auth.name ?? auth.email?.split('@')[0] ?? settings.userName) : settings.userName;
  const initials = initialsOf(displayName);

  return (
    <header className="h-[69px] shrink-0 brand-bg text-white border-b border-black/20 flex items-center gap-3 px-4 lg:px-6">
      <span className="lg:hidden"><button className="btn btn-icon !text-ink" aria-label="Otvori meni" onClick={onMenu}><Menu size={20} /></button></span>
      <div className="ml-auto flex items-center gap-2">
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
            <div className="absolute right-0 mt-2 w-[264px] card overflow-hidden z-50 text-ink shadow-xl" role="menu" data-testid="user-menu">
              <div className="flex items-center gap-3 px-4 py-3.5 bg-gradient-to-br from-[#fff7e0] to-[#fdf0f0] border-b border-line">
                <span className="w-11 h-11 shrink-0 rounded-full bg-accent text-brand-black grid place-items-center text-[15px] font-bold shadow-sm">{initials || 'ND'}</span>
                <div className="min-w-0">
                  <div className="font-semibold text-[15px] leading-tight truncate" data-testid="user-name">{displayName}</div>
                  {auth.email && <div className="text-[12.5px] text-slate-600 truncate mt-0.5" data-testid="user-email" title={auth.email}>{auth.email}</div>}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
                    {auth.role && <span className="pill !py-0 !px-2 !text-[11px] bg-[#fde4e4] text-[#b4141b]" data-testid="user-role">{auth.role === 'admin' ? 'Administrator' : auth.role}</span>}
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold tracking-wide uppercase text-slate-500"><Building2 size={11} />{settings.companyName}</span>
                  </div>
                </div>
              </div>
              <div className="p-1.5">
                <button className="w-full flex items-center gap-2.5 h-9 px-3 rounded-lg hover:bg-slate-100 text-sm text-slate-700" role="menuitem" onClick={() => { setUser(false); navigate('/podesavanja'); }}><Settings size={16} className="text-slate-500" />Podešavanja</button>
                <button className="w-full flex items-center gap-2.5 h-9 px-3 rounded-lg hover:bg-slate-100 text-sm text-slate-700" role="menuitem" onClick={() => { setUser(false); navigate('/pomoc'); }}><CircleHelp size={16} className="text-slate-500" />Pomoć</button>
              </div>
              {auth.enabled && (
                <div className="p-1.5 border-t border-line">
                  <button className="w-full flex items-center gap-2.5 h-9 px-3 rounded-lg hover:bg-[#fef3f2] text-sm font-medium text-[#b42318]" role="menuitem" data-testid="btn-logout" onClick={() => { setUser(false); void auth.signOut(); }}><LogOut size={16} />{auth.guest ? 'Izađi iz gostujućeg režima' : 'Odjavi se'}</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
