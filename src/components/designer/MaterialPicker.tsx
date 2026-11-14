import { ChevronDown, Search } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { compareMaterials, MATERIAL_GROUPS, materialShape } from '../../domain/models/materialShape';
import type { Material } from '../../domain/models/types';

/**
 * Izbor materijala u panelu: dugme koje otvara listu sa pretragom, razvrstanu po grupama. Lista ima širinu dugmeta (ne izlazi
 * iz panela), dugi nazivi se lome u više redova, a visina se prilagođava slobodnom mestu na ekranu (otvara se naniže ili naviše).
 * Na dnu je izbor „Prikaži sve materijale“ kad postoje materijali koji podrazumevano nisu ponuđeni.
 */
export function MaterialPicker({ materials, onPick, placeholder = '— izaberite novi materijal —', testId, ariaLabel, showAll }: {
  materials: Material[]; onPick: (id: string) => void; placeholder?: string; testId?: string; ariaLabel?: string;
  /** izbor „Prikaži sve materijale“: ne prikazuje se kad `visible` nije true */
  showAll?: { checked: boolean; onChange: (v: boolean) => void; visible: boolean };
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);

  // položaj liste: ispod dugmeta, a ako ispod nema mesta (a iznad ima više), iznad njega; uvek unutar ekrana
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      const r = btn.current!.getBoundingClientRect();
      const vh = window.innerHeight; const vw = window.innerWidth;
      const below = vh - r.bottom - 12; const above = r.top - 12;
      const width = Math.min(Math.max(r.width, 260), vw - 16);
      const left = Math.min(Math.max(8, r.left), vw - width - 8);
      if (below >= 260 || below >= above) setBox({ left, width, top: r.bottom + 4, maxH: Math.max(180, Math.min(below, 520)) });
      else setBox({ left, width, bottom: vh - r.top + 4, maxH: Math.max(180, Math.min(above, 520)) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { const t = e.target as Node; if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    document.addEventListener('mousedown', down);
    window.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('keydown', key, true); };
  }, [open]);

  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = materials.filter((m) => !t || m.name.toLowerCase().includes(t) || m.sku.toLowerCase().includes(t));
    return MATERIAL_GROUPS.map((g) => ({ ...g, items: list.filter((m) => materialShape(m).group === g.id).sort(compareMaterials) })).filter((g) => g.items.length);
  }, [materials, q]);

  return (
    <div className="relative">
      <button ref={btn} type="button" className="input !py-1.5 w-full flex items-center justify-between gap-2 text-left" data-testid={testId} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open}
        onClick={() => { setOpen((o) => !o); setQ(''); }}>
        <span className="truncate">{placeholder}</span><ChevronDown size={16} className="shrink-0 text-muted" />
      </button>
      {open && box && (
        <div ref={pop} role="listbox" className="fixed z-[120] bg-white border border-line rounded-xl shadow-xl flex flex-col overflow-hidden"
          style={{ left: box.left, width: box.width, maxHeight: box.maxH, ...(box.top !== undefined ? { top: box.top } : { bottom: box.bottom }) }} data-testid={testId ? `${testId}-list` : undefined}>
          <div className="p-2 border-b border-line shrink-0">
            <div className="relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input autoFocus className="input !py-1 !pl-8 text-[13px]" placeholder="Pretraga po nazivu ili šifri" aria-label="Pretraga materijala" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
          <div className="overflow-y-auto scroll-thin flex-1 min-h-0 py-1">
            {groups.length === 0 && <p className="text-[12.5px] text-muted px-3 py-3">Nema materijala koji odgovaraju pretrazi.</p>}
            {groups.map((g) => (
              <div key={g.id}>
                <div className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted">{g.label}</div>
                {g.items.map((m) => (
                  <button key={m.id} type="button" role="option" aria-selected={false} data-testid={testId ? `${testId}-option` : undefined} data-id={m.id} data-sku={m.sku}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-50 focus:bg-slate-50 outline-none" onClick={() => { setOpen(false); onPick(m.id); }}>
                    <span className="block text-[12.5px] leading-snug break-words">{m.name}</span>
                    <span className="block text-[11px] text-muted">{m.sku}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          {showAll?.visible && (
            <label className="shrink-0 border-t border-line px-3 py-2 flex items-center gap-2 text-[12.5px] bg-slate-50 cursor-pointer">
              <input type="checkbox" data-testid="swap-show-all" checked={showAll.checked} onChange={(e) => showAll.onChange(e.target.checked)} />
              Prikaži sve materijale
            </label>
          )}
        </div>
      )}
    </div>
  );
}
