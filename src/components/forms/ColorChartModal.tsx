import { useState } from 'react';
import { COLOR_CHART, DEFAULT_FAVORITE_COLORS, FAVORITE_COLOR_COUNT, FINISHES, colorHex, colorInfo, type RalColor } from '../../domain/models/catalog';
import type { Finish } from '../../domain/models/types';
import { Modal } from '../ui/Modal';

/** Boja kružića i polja karte: ton boje sa RAL ton karte. */
export const swatchBackground = (key: string): string => colorHex(key);

/** Pet boja za brzi izbor: zapisane ili podrazumevane; uvek tačno pet (nedostajuće se dopunjavaju podrazumevanim). */
export function normalizeFavorites(saved?: string[]): string[] {
  const out: string[] = [];
  for (const k of [...(saved ?? []), ...DEFAULT_FAVORITE_COLORS]) { if (!out.includes(k) && (k.startsWith('#') || colorInfo(k))) out.push(k); if (out.length === FAVORITE_COLOR_COUNT) break; }
  return out;
}

function Cell({ c, on, onPick }: { c: RalColor; on: boolean; onPick: (key: string) => void }) {
  return (
    <button type="button" data-testid="chart-color" data-color={c.key} aria-pressed={on} title={c.name === c.key ? c.key : `${c.key} — ${c.name}`} onClick={() => onPick(c.key)}
      className={`flex items-stretch rounded-md overflow-hidden border text-left ${on ? 'border-primary ring-2 ring-primary' : 'border-line hover:border-slate-400'}`}>
      <span className="bg-slate-400 text-white text-[10.5px] leading-none px-1.5 py-2 w-[68px] shrink-0 self-stretch flex items-center whitespace-nowrap">{c.key}</span>
      <span className="flex-1 min-h-[28px]" style={{ background: swatchBackground(c.key) }} />
    </button>
  );
}

/**
 * Karta boja (RAL ton karta). Klik na boju je bira i zatvara prozor. U načinu „Uredi brzi izbor" klik na polje među pet izabranih
 * pa na boju sa karte menja koja se boja nudi u poljima za boju. Ispod je izbor završne obrade (mat / sjaj / struktura).
 */
export function ColorChartModal({ value, finish, favorites, onPick, onFinish, onFavorites, onClose }: {
  value: string; finish?: Finish; favorites: string[];
  onPick: (key: string) => void; onFinish?: (f: Finish) => void; onFavorites: (list: string[]) => void; onClose: () => void;
}) {
  const [edit, setEdit] = useState(false);
  const [slot, setSlot] = useState(0);
  const favs = normalizeFavorites(favorites);

  const choose = (key: string) => {
    if (!edit) { onPick(key); onClose(); return; }
    // dve iste boje u brzom izboru nemaju smisla: boja koja već postoji zamenjuje mesto sa izabranim poljem
    const next = [...favs];
    const at = next.indexOf(key);
    if (at >= 0 && at !== slot) next[at] = next[slot];
    next[slot] = key;
    onFavorites(next);
    setSlot((slot + 1) % FAVORITE_COLOR_COUNT);
  };

  return (
    <Modal title="Karta boja" width={980} onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center gap-3 w-full">
          {onFinish && (
            <div className="flex items-center gap-2" data-testid="chart-finish">
              <span className="text-[13px] font-semibold">Završna obrada</span>
              <span className="inline-flex rounded-lg border border-line overflow-hidden" role="radiogroup" aria-label="Završna obrada">
                {FINISHES.map((f) => <button key={f.id} type="button" role="radio" aria-checked={finish === f.id} data-testid={`chart-finish-${f.id}`} onClick={() => onFinish(f.id)} className={`px-3 py-1.5 text-[13px] font-semibold ${finish === f.id ? 'bg-brand-black text-white' : 'hover:bg-slate-50'}`}>{f.label}</button>)}
              </span>
            </div>
          )}
          <span className="flex-1" />
          <button className="btn btn-primary" onClick={onClose} data-testid="chart-close">Zatvori</button>
        </div>
      }>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="inline-flex rounded-lg border border-line overflow-hidden" role="group" aria-label="Način rada">
          <button type="button" aria-pressed={!edit} data-testid="chart-mode-pick" className={`px-3 py-1.5 text-[13px] font-semibold ${!edit ? 'bg-brand-black text-white' : 'hover:bg-slate-50'}`} onClick={() => setEdit(false)}>Izaberi boju</button>
          <button type="button" aria-pressed={edit} data-testid="chart-mode-edit" className={`px-3 py-1.5 text-[13px] font-semibold ${edit ? 'bg-brand-black text-white' : 'hover:bg-slate-50'}`} onClick={() => setEdit(true)}>Uredi brzi izbor</button>
        </div>
        <div className="flex items-center gap-2" data-testid="chart-favorites">
          <span className="text-[12.5px] text-slate-600">Brzi izbor (5 boja):</span>
          {favs.map((k, i) => (
            <button key={`${k}-${i}`} type="button" data-testid="chart-fav" data-color={k} disabled={!edit} aria-label={`Mesto ${i + 1}: ${k}`} title={k} onClick={() => setSlot(i)}
              className={`w-8 h-8 rounded-full ${edit && slot === i ? 'ring-2 ring-primary ring-offset-2' : 'ring-1 ring-black/15'} ${edit ? 'cursor-pointer' : 'cursor-default'}`} style={{ background: swatchBackground(k) }} />
          ))}
        </div>
        <p className="text-[12.5px] text-slate-600 basis-full md:basis-auto">
          {edit ? 'Izaberite mesto među pet kružića, pa kliknite boju na karti: ona se nudi u poljima za boju. Posle svakog izbora prelazi se na sledeće mesto.' : 'Kliknite boju na karti da je izaberete.'}
        </p>
      </div>

      <div className="text-[13px] font-semibold mb-1.5">RAL ton karta</div>
      <div className="grid gap-1.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="chart-grid">
        {COLOR_CHART.map((c) => <Cell key={c.key} c={c} on={c.key === value} onPick={choose} />)}
      </div>
    </Modal>
  );
}
