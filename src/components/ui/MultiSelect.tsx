import { ChevronDown, Search } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { normalizeSearch as norm } from '../../utils/search';

/** Više nezavisnih izbora: ista spoljna kontrola kao izbor jedne vrednosti, a u listi checkbox polja. */
export function MultiSelect({ label, values, options, onChange, testId }: {
  label: string; values: string[]; options: { value: string; label: string; testId?: string }[];
  onChange: (values: string[]) => void; testId: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number }>();
  const close = (focus = true) => { setOpen(false); setQuery(''); if (focus) trigger.current?.focus(); };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = trigger.current?.getBoundingClientRect(); if (!r) return;
      const below = window.innerHeight - r.bottom - 12; const above = r.top - 12;
      const width = Math.min(Math.max(r.width, 300), window.innerWidth - 16);
      const base = { left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), width };
      setPosition(below < 240 && above > below ? { ...base, bottom: window.innerHeight - r.top + 4, maxHeight: Math.max(100, Math.min(400, above)) }
        : { ...base, top: r.bottom + 4, maxHeight: Math.max(100, Math.min(400, below)) });
    };
    place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!popup.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) close(false); };
    document.addEventListener('mousedown', down); return () => document.removeEventListener('mousedown', down);
  }, [open]);
  const filtered = options.filter((o) => norm(query).split(/\s+/).every((w) => norm(o.label).includes(w)));
  return <div className="max-w-xl mb-5" data-testid={testId}>
    <button type="button" ref={trigger} className="input flex items-center justify-between gap-2 text-left" aria-haspopup="dialog" aria-controls={open ? id : undefined} aria-expanded={open}
      onClick={() => open ? close() : setOpen(true)}><span>{label} ({values.length})</span><ChevronDown size={16} className="shrink-0 text-muted" /></button>
    {open && position && createPortal(<div ref={popup} id={id} role="dialog" aria-label={label} data-search-select-open className="select-popup fixed z-[300] flex flex-col overflow-hidden" style={position}
      onBlurCapture={(e) => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node) && e.relatedTarget !== trigger.current) close(false); }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }}>
      <label className="flex items-center gap-2 p-3 border-b border-line"><Search size={15} className="text-muted" />
        <input autoFocus aria-label="Pretraga modela" className="input min-w-0 flex-1 !py-1" placeholder="Pretraga modela" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="overflow-auto scroll-thin p-2">
        {filtered.map((o) => <label key={o.value} className="flex items-center gap-2 px-2 py-2 rounded hover:bg-slate-50 text-sm cursor-pointer">
          <input type="checkbox" data-testid={o.testId} checked={values.includes(o.value)} onChange={(e) => onChange(e.target.checked ? [...new Set([...values, o.value])] : values.filter((v) => v !== o.value))} />
          <span>{o.label}</span>
        </label>)}
        {!filtered.length && <p className="p-2 text-sm text-muted">{options.length ? 'Nema rezultata.' : 'Najpre napravite model ograde.'}</p>}
      </div>
      <div className="flex justify-between items-center gap-2 p-2 border-t border-line text-xs text-muted"><span>Izabrano: {values.length}</span><button className="btn btn-sm" type="button" onClick={() => close()}>Gotovo</button></div>
    </div>, document.body)}
  </div>;
}
