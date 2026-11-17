import { MoreHorizontal } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MODEL_IMAGES } from '../../assets/models';
import { PHOTOS } from '../../assets/photos';
import { FENCE_MODELS } from '../../domain/models/catalog';
import type { FenceModelId } from '../../domain/models/types';
import { STATUS_LABELS } from '../../domain/models/catalog';
import type { Project, ProjectStatus } from '../../domain/models/types';
import { FrontView, frontViewMetrics } from '../editor/FrontView';

export function StatusPill({ status }: { status: ProjectStatus }) {
  return <span className={`pill pill-${status}`}>{STATUS_LABELS[status]}</span>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-[26px] font-bold leading-tight">{title}</h1>
        {subtitle && <p className="text-muted text-sm mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="p-4 sm:p-6 max-w-[1500px] mx-auto">{children}</div>;
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="card p-10 text-center">
      <div className="font-semibold text-lg mb-1">{title}</div>
      <p className="text-muted text-sm mb-4">{text}</p>
      {action}
    </div>
  );
}

export function DemoBadge({ children = 'Demonstracioni podaci' }: { children?: ReactNode }) {
  return <span className="inline-block text-[11px] font-semibold text-[#b45309] bg-[#fef3c7] rounded-full px-2.5 py-0.5">{children}</span>;
}

/** Slika modela ograde (kataloška slika), fotografija ili generisana SVG ilustracija. */
export function ModelThumb({ photo, modelId, className = '', full = false }: { photo?: string | null; modelId?: string; className?: string; full?: boolean }) {
  const def = modelId ? FENCE_MODELS[modelId as FenceModelId] : undefined;
  if (def && MODEL_IMAGES[def.image]) {
    return <img src={MODEL_IMAGES[def.image]} alt={def.name} loading="lazy" className={`object-contain w-full h-full p-2 ${className}`} />;
  }
  if (photo && PHOTOS[photo]) {
    return <img src={full ? PHOTOS[photo].full : PHOTOS[photo].thumb} alt="" loading="lazy" className={`object-cover w-full h-full ${className}`} />;
  }
  return <div className={`w-full h-full bg-slate-100 ${className}`} aria-hidden="true" />;
}

/** Minijatura cele konfiguracije projekta (stvarni SVG, bez kota), fiksnog odnosa stranica, bez rastezanja. */
export function ProjectThumb({ project, width = 64 }: { project: Project; width?: number }) {
  const height = Math.round(width * 0.62);
  if (project.items.length === 0) {
    return <div className="rounded border border-dashed border-line bg-slate-50 grid place-items-center text-[9px] text-muted shrink-0" style={{ width, height }} aria-hidden="true">prazno</div>;
  }
  const m = frontViewMetrics(project, 1, false, true);
  const scale = Math.min(width / m.vw, height / m.vh);
  return (
    <div className="rounded overflow-hidden border border-line bg-white shrink-0" style={{ width, height }} aria-hidden="true" data-testid="project-thumb">
      <FrontView project={project} scale={scale} compact className="!w-full !h-full" options={{ showDimensions: false, showGrid: false, showLabels: false }} />
    </div>
  );
}

export interface MenuAction { label: string; onClick: () => void; danger?: boolean }

/** Meni sa akcijama; bez `text` je dugme sa tri tačke, a sa `text` (i `icon`) vidljivo dugme sa natpisom. */
export function ActionsMenu({ actions, label = 'Akcije', text, icon, testId }: { actions: MenuAction[]; label?: string; text?: string; icon?: ReactNode; testId?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  // meni se crta preko cele stranice (portal, fixed), pa ga tabela sa skrolom ne seče
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const h = menuRef.current?.offsetHeight ?? actions.length * 40 + 12;
    const below = window.innerHeight - r.bottom - 8;
    const top = below >= h ? r.bottom + 4 : Math.max(8, r.top - h - 4);
    setPos({ top, left: Math.max(8, r.right - 176) });
  }, [open, actions.length]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', down);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); };
  }, [open]);
  return (
    <div className="relative inline-block" ref={ref}>
      <button ref={btnRef} className={text ? 'btn btn-sm whitespace-nowrap' : 'btn btn-icon !border-transparent'} aria-label={label} aria-haspopup="menu" aria-expanded={open} data-testid={testId} onClick={() => { setPos(null); setOpen((o) => !o); }}>
        {text ? <>{icon}{text}</> : <MoreHorizontal size={18} />}
      </button>
      {open && createPortal(
        <div ref={menuRef} role="menu" className="fixed w-44 card p-1.5 z-[100]" style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}>
          {actions.map((a) => (
            <button key={a.label} role="menuitem" className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-slate-50 ${a.danger ? 'text-[#b42318]' : ''}`} onClick={() => { setOpen(false); a.onClick(); }}>
              {a.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
