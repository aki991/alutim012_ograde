import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SearchOption { value: string; label: string }
export interface SearchGroup { label?: string; items: SearchOption[] }

/** mala slova bez dijakritika, „×“ i „x“ su isto (da „40x20“ nađe „40×20×1“) */
const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'dj').replace(/×/g, 'x').replace(/,/g, '.');

/**
 * Izbor sa pretragom: klik otvara listu sa poljem za kucanje, pretraga traži sve reči u nazivu (i šifri). Strelice biraju,
 * Enter potvrđuje, Esc zatvara. Lista je u sloju iznad stranice (ne seče je panel sa skrolom ni dijalog).
 */
export function SearchSelect({ value, onChange, groups, placeholder = '— izaberite —', testId, searchPlaceholder = 'Kucajte za pretragu…' }: {
  value: string; onChange: (v: string) => void; groups: SearchGroup[]; placeholder?: string; testId?: string; searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => groups.flatMap((g) => g.items).find((o) => o.value === value), [groups, value]);
  const filtered = useMemo(() => {
    const words = norm(query).split(/\s+/).filter(Boolean);
    return groups.map((g) => ({ ...g, items: words.length ? g.items.filter((o) => { const t = norm(o.label); return words.every((w) => t.includes(w)); }) : g.items })).filter((g) => g.items.length);
  }, [groups, query]);
  // prvi red je „bez izbora“ (samo dok se ne kuca pretraga)
  const flat = useMemo<SearchOption[]>(() => [...(query.trim() ? [] : [{ value: '', label: placeholder }]), ...filtered.flatMap((g) => g.items)], [filtered, query, placeholder]);

  const place = () => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth; const vh = window.innerHeight;
    const width = Math.min(Math.max(r.width, 300), vw - 16);
    const left = Math.max(8, Math.min(r.left, vw - width - 8));
    const below = vh - r.bottom - 8; const above = r.top - 8;
    // lista ide ispod polja, a iznad njega samo ako dole nema mesta
    if (below < 240 && above > below) setPos({ left, width, bottom: vh - r.top + 4, maxH: Math.min(380, above - 4) });
    else setPos({ left, width, top: r.bottom + 4, maxH: Math.min(380, below - 4) });
  };

  const close = (focusTrigger = true) => { setOpen(false); setQuery(''); if (focusTrigger) trigger.current?.focus(); };
  const pick = (v: string) => { onChange(v); close(); };

  useLayoutEffect(() => { if (open) place(); }, [open]);
  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, flat.findIndex((o) => o.value === value)));
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popup.current?.contains(t) || trigger.current?.contains(t)) return;
      close(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active, open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = flat[active]; if (o) pick(o.value); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') close(); // fokus se vraća na polje, pa Tab ide na sledeće polje
  };

  let idx = -1;
  const row = (o: SearchOption) => {
    idx += 1;
    const i = idx;
    const on = o.value === value;
    return (
      <div key={`${o.value}-${i}`} role="option" aria-selected={on} data-active={i === active} data-testid={testId ? `${testId}-option` : undefined}
        className={`flex items-center gap-2 px-3 py-1.5 text-[14px] cursor-pointer ${i === active ? 'bg-primary/10' : ''} ${o.value === '' ? 'text-muted' : ''}`}
        onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o.value)}>
        <span className="flex-1 min-w-0">{o.label}</span>{on && <Check size={14} className="text-primary shrink-0" />}
      </div>
    );
  };

  return (
    <>
      <button ref={trigger} type="button" className="input flex items-center justify-between gap-2 text-left" data-testid={testId} role="combobox" aria-expanded={open} aria-haspopup="listbox" onClick={() => (open ? close() : setOpen(true))}>
        <span className={`truncate ${selected && value ? '' : 'text-muted'}`}>{selected && value ? selected.label : placeholder}</span>
        <ChevronDown size={16} className="shrink-0 text-muted" />
      </button>
      {open && pos && createPortal(
        <div ref={popup} className="fixed z-[300] flex flex-col rounded-lg border border-line bg-white shadow-xl overflow-hidden" style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }} data-search-select-open="true">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-line shrink-0">
            <Search size={15} className="text-muted shrink-0" />
            <input autoFocus data-search-select-open="true" data-testid={testId ? `${testId}-search` : undefined} className="w-full text-[14px] outline-none bg-transparent" placeholder={searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} aria-label="Pretraga" />
          </div>
          <div ref={listRef} role="listbox" className="overflow-auto scroll-thin py-1 min-h-0">
            {filtered.length === 0 && query.trim() ? <div className="px-3 py-3 text-sm text-muted">Nema rezultata za „{query.trim()}“.</div> : null}
            {query.trim() ? null : row(flat[0])}
            {filtered.map((g, gi) => (
              <div key={g.label ?? gi}>
                {g.label && <div className="px-3 pt-2 pb-1 text-[12px] font-bold text-slate-700">{g.label}</div>}
                {g.items.map(row)}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
