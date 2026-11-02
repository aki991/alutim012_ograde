import { MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
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

export function ActionsMenu({ actions, label = 'Akcije' }: { actions: MenuAction[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div className="relative inline-block" ref={ref}>
      <button className="btn btn-icon !border-transparent" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}><MoreHorizontal size={18} /></button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1 w-44 card p-1.5 z-40">
          {actions.map((a) => (
            <button key={a.label} role="menuitem" className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-slate-50 ${a.danger ? 'text-[#b42318]' : ''}`} onClick={() => { setOpen(false); a.onClick(); }}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
