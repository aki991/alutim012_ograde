import { ChoiceGroup } from '../ui/ChoiceGroup';
import { useState } from 'react';
import { COLOR_CHART, DEFAULT_FAVORITE_COLORS, FAVORITE_COLOR_COUNT, FINISHES, WOOD_COLORS, colorHex, colorInfo, isWoodColor, type RalColor } from '../../domain/models/catalog';
import { WOOD_DECORS, WOOD_GROUPS } from '../../data/drvo-dekori';
import { GrainFilter, grainSeed } from '../fences/woodGrain';
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
  const title = c.name === c.key ? c.key : `${c.key} — ${c.name}`;
  return (
    <button type="button" data-testid="chart-color" data-color={c.key} aria-pressed={on} title={title} onClick={() => onPick(c.key)}
      className={`flex items-stretch rounded-md overflow-hidden border text-left ${on ? 'border-primary ring-2 ring-primary' : 'border-line hover:border-slate-400'}`}>
      <span className={`bg-slate-400 text-white text-[10.5px] leading-none px-1.5 py-2 shrink-0 self-stretch flex items-center whitespace-nowrap w-[68px]`}>{c.key}</span>
      <span className="flex-1 min-h-[28px]" style={{ background: swatchBackground(c.key) }} />
    </button>
  );
}

/** mešavina dva tona (za traku od pet nijansi ispod uzorka) */
function mixHex(a: string, b: string, t = 0.5): string {
  const p = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2].map((i) => Math.round(p(a, i) * (1 - t) + p(b, i) * t).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Drvo dekor na karti: veliki uzorak sa šarom drveta (iste pruge kao na crtežu ograde), ispod traka od pet nijansi
 * (svetli ton … osnovni … tamni ton), pa naziv dekora i kod boje.
 */
function WoodCard({ c, on, onPick }: { c: RalColor; on: boolean; onPick: (key: string) => void }) {
  const w = c.wood!;
  const fid = `wood-card-${grainSeed(c.key)}-${c.key.replace(/[^a-z0-9]/gi, '')}`;
  const en = WOOD_DECORS.find((d) => `Dekor ${d.name}` === c.key)?.nameEn;
  const tones = [w.light, mixHex(w.light, c.hex), c.hex, mixHex(c.hex, w.dark), w.dark];
  return (
    <button type="button" data-testid="chart-color" data-color={c.key} aria-pressed={on} title={`${c.key}${w.renolit ? ` — Renolit ${w.renolit}` : ''} (boja je približna)`} onClick={() => onPick(c.key)}
      className={`flex flex-col rounded-lg overflow-hidden border bg-white text-left ${on ? 'border-primary ring-2 ring-primary' : 'border-line hover:border-slate-400'}`}>
      <svg viewBox="0 0 600 260" preserveAspectRatio="none" className="block w-full h-[104px]" aria-hidden="true" data-testid="wood-swatch">
        <defs><GrainFilter id={fid} seed={grainSeed(c.key)} /></defs>
        <rect width="600" height="260" fill={c.hex} filter={`url(#${fid})`} />
      </svg>
      <span className="flex h-2.5">{tones.map((t, i) => <span key={i} className="flex-1" style={{ background: t }} />)}</span>
      <span className="px-2.5 pt-1.5 pb-2 leading-tight">
        <span className="block font-semibold text-[13.5px]">{c.name}</span>
        {en && <span className="block text-[11.5px] text-muted">{en}</span>}
        <span className="block text-[11.5px] tabular-nums text-slate-600 mt-0.5">{c.hex.toUpperCase()}{w.renolit ? ` · Renolit ${w.renolit}` : ''}</span>
      </span>
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
  // karta: RAL ton karta ili drvo dekor; otvara se ona na kojoj je trenutna boja
  const [chart, setChart] = useState<'ral' | 'wood'>(isWoodColor(value) ? 'wood' : 'ral');
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
              <ChoiceGroup label="Završna obrada" value={finish ?? ''} onChange={onFinish}
                options={FINISHES.map((f) => ({ value: f.id, label: f.label, testId: `chart-finish-${f.id}` }))} />
            </div>
          )}
          <span className="flex-1" />
          <button className="btn" onClick={onClose} data-testid="chart-close">Zatvori</button>
        </div>
      }>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <ChoiceGroup label="Način rada" value={edit ? 'edit' : 'pick'} onChange={(v) => setEdit(v === 'edit')}
          options={[{ value: 'pick', label: 'Izaberi boju', testId: 'chart-mode-pick' }, { value: 'edit', label: 'Uredi brzi izbor', testId: 'chart-mode-edit' }]} />
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

      <div className="mb-2">
        <ChoiceGroup label="Karta boja" value={chart} onChange={setChart}
          options={[{ value: 'ral', label: 'RAL ton karta', testId: 'chart-tab-ral' }, { value: 'wood', label: 'Drvo dekor', testId: 'chart-tab-wood' }]} />
      </div>
      {chart === 'ral' ? (
        <>
          <div className="text-[13px] font-semibold mb-1.5">RAL ton karta</div>
          <div className="grid gap-1.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="chart-grid">
            {COLOR_CHART.map((c) => <Cell key={c.key} c={c} on={c.key === value} onPick={choose} />)}
          </div>
        </>
      ) : (
        <div data-testid="chart-wood">
          <div className="text-[13px] font-semibold mb-0.5">Drvo dekor</div>
          <p className="text-[12px] text-slate-600 mb-1.5">Boje su približne (za prikaz na ekranu); stvarni ton određuje uzorak folije.</p>
          {WOOD_GROUPS.map((g) => (
            <div key={g} className="mb-2.5">
              <div className="text-[12px] font-semibold text-slate-600 mb-1">{g} · {WOOD_COLORS.filter((c) => c.wood!.group === g).length}</div>
              <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" data-testid={`chart-wood-${g}`}>
                {WOOD_COLORS.filter((c) => c.wood!.group === g).map((c) => <WoodCard key={c.key} c={c} on={c.key === value} onPick={choose} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
