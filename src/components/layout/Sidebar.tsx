import {
  BarChart3, CircleHelp, Database, FileText, FolderOpen, Home, LayoutGrid, PencilRuler, Settings, Users, Wrench, type LucideIcon,
} from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { currentProjectId, useAppStore } from '../../store/useAppStore';
import { PHOTOS } from '../../assets/photos';
import { Logo } from './Logo';

interface Item { to: string; label: string; icon: LucideIcon; end?: boolean }

const MAIN: Item[] = [
  { to: '/', label: 'Početna', icon: Home, end: true },
  { to: '/projekti', label: 'Projekti', icon: FolderOpen },
  { to: '/modeli', label: 'Modeli ograda', icon: LayoutGrid },
  { to: '/materijali', label: 'Materijali i cene', icon: Database },
  { to: '/kupci', label: 'Kupci', icon: Users },
  { to: '/ponude', label: 'Ponude', icon: FileText },
  { to: '/proizvodnja', label: 'Proizvodnja', icon: Wrench },
  { to: '/izvestaji', label: 'Izveštaji', icon: BarChart3 },
];
const SECONDARY: Item[] = [
  { to: '/podesavanja', label: 'Podešavanja', icon: Settings },
  { to: '/pomoc', label: 'Pomoć', icon: CircleHelp },
];

const base = 'flex items-center gap-3 h-11 px-4 rounded-xl text-[15px] transition-colors';
const idle = 'text-slate-300 hover:bg-white/8 hover:text-white';
const active = 'bg-accent text-brand-black font-semibold shadow-[0_4px_14px_rgba(255,194,71,.35)]';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const newProject = useAppStore((s) => s.newProject);
  const inEditor = pathname.startsWith('/editor');

  const renderItem = (it: Item) => (
    <NavLink key={it.to} to={it.to} end={it.end} onClick={onNavigate} className={({ isActive }) => `${base} ${isActive ? active : idle}`}>
      <it.icon size={20} strokeWidth={1.8} />
      <span>{it.label}</span>
    </NavLink>
  );

  return (
    <aside className="h-full flex flex-col brand-bg-side text-white w-[234px] shrink-0 overflow-y-auto scroll-thin" aria-label="Glavna navigacija">
      <div className="px-5 pt-6 pb-6"><Logo /></div>
      <nav className="px-3 shrink-0">
        <div className="flex flex-col gap-1">
          {renderItem(MAIN[0])}
          <button
            type="button"
            data-testid="nav-current-project"
            className={`${base} text-left ${inEditor ? active : idle}`}
            onClick={() => { const id = currentProjectId() ?? newProject(); onNavigate?.(); navigate(`/editor/${id}`); }}
          >
            <PencilRuler size={20} strokeWidth={1.8} />
            <span>Trenutni projekat</span>
          </button>
          {MAIN.slice(1).map(renderItem)}
        </div>
        <div className="my-5 mx-3 border-t border-white/10" />
        <div className="flex flex-col gap-1">{SECONDARY.map(renderItem)}</div>
      </nav>
      <div className="relative flex-1 min-h-[140px] mt-4 overflow-hidden" aria-hidden="true" data-testid="sidebar-photo">
        <img src={PHOTOS['kapija-lamele'].full} alt="" className="absolute inset-0 w-full h-full object-cover object-[35%_70%]" />
        <div className="absolute inset-0 bg-gradient-to-b from-sidebar via-sidebar/55 to-sidebar/10" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute left-6 bottom-6 text-[11px] font-medium tracking-[0.28em] leading-relaxed text-white/90">
          KVALITET<br />U SVAKOM<br />DETALJU
          <div className="mt-3 w-7 border-t border-white/70" />
        </div>
      </div>
    </aside>
  );
}
