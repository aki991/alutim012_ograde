import { Bell, Building2, ChevronDown, CircleHelp, FileText, LogOut, Menu, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { useAuth } from '../../services/auth';
import { initialsOf } from '../../utils/units';
import { useFieldSpecs } from '../../hooks/useFieldSpecs';
import { fmtDateTime, positionsLabel, SPEC_STATUS_LABELS, type FieldSpec } from '../../services/fieldSpecs';
import { FieldSpecModal, specAmount } from '../notifications/FieldSpecModal';

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
  const specs = useFieldSpecs();
  const [openSpec, setOpenSpec] = useState<FieldSpec | null>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  useOutside(bellRef, () => setBell(false));
  useOutside(userRef, () => setUser(false));

  // prijavljen korisnik: ime iz naloga, a ako ga nema deo emaila; bez prijave ostaje lokalno ime iz podešavanja
  const displayName = auth.guest ? 'Gost' : auth.enabled ? (auth.name ?? auth.login?.split('@')[0] ?? settings.userName) : settings.userName;
  const initials = initialsOf(displayName);

  return (
    <>
    <header className="h-[69px] shrink-0 brand-bg text-white border-b border-black/20 flex items-center gap-3 px-4 lg:px-6">
      <span className="lg:hidden"><button className="btn btn-icon !text-ink" aria-label="Otvori meni" onClick={onMenu}><Menu size={20} /></button></span>
      <div className="ml-auto flex items-center gap-2">
        <div className="relative" ref={bellRef}>
          <button className="btn btn-icon !border-transparent !bg-transparent !text-white hover:!bg-white/10 relative" aria-label={specs.unread > 0 ? `Obaveštenja (${specs.unread} nepročitano)` : 'Obaveštenja'} onClick={() => { setBell((b) => !b); setUser(false); if (!bell) void specs.reload(); }}>
            <Bell size={20} />
            {specs.unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-brand-black text-[11px] font-bold grid place-items-center leading-none" data-testid="bell-badge">{specs.unread > 9 ? '9+' : specs.unread}</span>}
          </button>
          {bell && (
            <div className="absolute right-0 mt-2 w-[360px] max-w-[calc(100vw-24px)] card p-2 z-50 text-ink" role="menu" data-testid="bell-menu">
              {!specs.enabled || specs.items.length === 0 ? (
                <div className="px-2 py-3 text-sm text-center text-slate-600" data-testid="bell-empty">{specs.error && specs.enabled ? 'Provera obaveštenja nije uspela. Pokušajte kasnije.' : 'Nema obaveštenja.'}</div>
              ) : (
                <>
                  <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
                    <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Specifikacije sa terena</span>
                    {specs.unread > 0 && <button className="whitespace-nowrap font-medium text-primary hover:underline" style={{ fontSize: 12 }} data-testid="bell-mark-all" onClick={specs.markAllSeen}>Označi sve kao pročitano</button>}
                  </div>
                  <ul className="max-h-[360px] overflow-y-auto scroll-thin" data-testid="bell-list">
                    {specs.items.map((s) => {
                      const isNew = !specs.seen.has(s.id);
                      return (
                        <li key={s.id}>
                          <button className={`w-full text-left flex gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-100 ${isNew ? 'bg-[#fff7e0]' : ''}`} data-testid="bell-item" data-unread={isNew} onClick={() => { specs.markSeen([s.id]); setOpenSpec(s); setBell(false); }}>
                            <span className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-primary-50 text-primary grid place-items-center"><FileText size={16} /></span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5"><span className={`truncate text-[13.5px] ${isNew ? 'font-bold' : 'font-semibold'}`}>{s.customerName || 'Specifikacija bez naziva kupca'}</span>{isNew && <span className="shrink-0 w-2 h-2 rounded-full bg-primary" aria-label="Novo" />}</span>
                              <span className="block text-[12px] text-slate-600 truncate">{s.technician ? `${s.technician} · ` : ''}{positionsLabel(s.positionCount)} · {specAmount(s)}{s.hasUnpriced ? ' + bez cene' : ''}</span>
                              <span className="block text-[11.5px] text-muted">{fmtDateTime(s.createdAt)} · {SPEC_STATUS_LABELS[s.status] ?? s.status}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
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
                  {auth.login && <div className="text-[12.5px] text-slate-600 truncate mt-0.5" data-testid="user-email" title={auth.login}>{auth.login}</div>}
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
    {/* izvan zaglavlja: prozor ne sme da nasledi belu boju teksta iz zaglavlja */}
    {openSpec && <FieldSpecModal spec={openSpec} onClose={() => setOpenSpec(null)} />}
    </>
  );
}
