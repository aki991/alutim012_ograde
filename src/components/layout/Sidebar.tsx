import {
  BarChart3, Boxes, CircleHelp, Database, DoorOpen, Fence, FileText, FolderOpen, Home, LayoutGrid, PanelLeftClose, PanelLeftOpen, PencilRuler, Settings, Users, Wrench, type LucideIcon,
} from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { currentProjectId, useAppStore } from '../../store/useAppStore';
import { PHOTOS } from '../../assets/photos';
import { FEATURES } from '../../config/features';
import { Logo } from './Logo';

interface Item { to: string; label: string; icon: LucideIcon; end?: boolean }

const MAIN: Item[] = [
  { to: '/', label: 'Početna', icon: Home, end: true },
  { to: '/projekti', label: 'Projekti', icon: FolderOpen },
  { to: '/modeli', label: 'Modeli ograda', icon: LayoutGrid },
  { to: '/modeli-kapija', label: 'Modeli kapija', icon: DoorOpen },
  ...(FEATURES.terraceFences ? [{ to: '/modeli-terasa', label: 'Modeli ograda za terase', icon: Fence }] : []),
  { to: '/materijali', label: 'Materijali i cene', icon: Database },
  { to: '/magacin', label: 'Magacin', icon: Boxes },
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

export function Sidebar({ onNavigate, compact = false, onToggle }: { onNavigate?: () => void; compact?: boolean; onToggle?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;
  const newProject = useAppStore((s) => s.newProject);
  const inEditor = pathname.startsWith('/editor');
  // crtež modela je na adresi /modeli/crtanje: dok se crta kapija, označena je stavka „Modeli kapija“, a ne „Modeli ograda“
  const drawingKind = pathname.startsWith('/modeli/crtanje') ? (location.state as { kind?: string } | null)?.kind : undefined;
  const drawingGate = drawingKind === 'gate';
  // ograda za terasu otvorena na staroj adresi crtanja: označena je stavka „Modeli ograda za terase“
  const drawingTerrace = drawingKind === 'terrace';
  const activeOf = (to: string, isActive: boolean) => (to === '/modeli' ? isActive && !drawingGate && !drawingTerrace
    : to === '/modeli-kapija' ? isActive || drawingGate : to === '/modeli-terasa' ? isActive || drawingTerrace : isActive);

  const renderItem = (it: Item) => (
    <NavLink key={it.to} to={it.to} end={it.end} onClick={onNavigate} aria-label={it.label} title={compact ? it.label : undefined} className={({ isActive }) => `${base} ${compact ? '!px-0 justify-center' : ''} ${activeOf(it.to, isActive) ? active : idle}`}>
      <it.icon size={20} strokeWidth={1.8} className="shrink-0" />
      <span className={compact ? 'sr-only' : ''}>{it.label}</span>
    </NavLink>
  );

  return (
    <aside className={`h-full flex flex-col brand-bg-side text-white ${compact ? 'w-[64px]' : 'w-[234px]'} shrink-0 overflow-y-auto scroll-thin`} aria-label="Glavna navigacija" data-testid="main-navigation" data-compact={compact}>
      {compact ? <div className="text-center font-extrabold text-accent py-4 text-sm" aria-label="ALU TIM 012">012</div> : <div className="px-5 pt-6 pb-6"><Logo /></div>}
      {onToggle && <button type="button" className={`mx-2 mb-3 flex items-center justify-center gap-2 rounded-lg h-9 ${idle}`} onClick={onToggle} aria-label={compact ? 'Proširi glavni meni' : 'Suzi glavni meni'} aria-expanded={!compact} data-testid="toggle-navigation" title={compact ? 'Proširi glavni meni' : 'Suzi glavni meni'}>{compact ? <PanelLeftOpen size={19} /> : <><PanelLeftClose size={19} /><span className="text-sm">Suzi meni</span></>}</button>}
      <nav className={`${compact ? 'px-2' : 'px-3'} shrink-0`}>
        <div className="flex flex-col gap-1">
          {renderItem(MAIN[0])}
          <button
            type="button"
            data-testid="nav-current-project"
            aria-label="Trenutni projekat" title={compact ? 'Trenutni projekat' : undefined}
            className={`${base} ${compact ? '!px-0 justify-center' : 'text-left'} ${inEditor ? active : idle}`}
            onClick={() => { const id = currentProjectId() ?? newProject(); onNavigate?.(); navigate(`/editor/${id}`); }}
          >
            <PencilRuler size={20} strokeWidth={1.8} className="shrink-0" />
            <span className={compact ? 'sr-only' : ''}>Trenutni projekat</span>
          </button>
          {MAIN.slice(1).map(renderItem)}
        </div>
        <div className="my-5 mx-3 border-t border-white/10" />
        <div className="flex flex-col gap-1">{SECONDARY.map(renderItem)}</div>
      </nav>
      {/* ukrasna slika samo kad ima mesta: na nižem ekranu bi se sekla na dnu menija */}
      <div className={`relative flex-1 min-h-[160px] mt-4 overflow-hidden [@media(max-height:960px)]:hidden ${compact ? 'hidden' : ''}`} aria-hidden="true" data-testid="sidebar-photo">
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
