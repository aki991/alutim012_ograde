import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { colorInfo, colorText, FINISHES } from '../../domain/models/catalog';
import type { Finish } from '../../domain/models/types';
import { useAppStore } from '../../store/useAppStore';
import { ColorChartModal, normalizeFavorites, swatchBackground } from './ColorChartModal';
import { validateRange, type Range } from '../../domain/validation/limits';
import { fromCurrency, toCurrency } from '../../utils/units';

export function Field({ label, children, hint, error, htmlFor, stacked }: { label: string; children: ReactNode; hint?: ReactNode; error?: string | null; htmlFor?: string; stacked?: boolean }) {
  return (
    <div className={`grid ${stacked ? 'grid-cols-1' : 'grid-cols-[minmax(0,0.8fr)_minmax(0,1.45fr)]'} items-center gap-x-3 gap-y-1 py-1.5`}>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      <div>{children}</div>
      {(hint || error) && (
        <div className={`${stacked ? '' : 'col-span-2'} text-xs leading-snug`}>
          {error ? <span className="text-[#b42318]" role="alert">{error}</span> : <span className="text-muted">{hint}</span>}
        </div>
      )}
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  range: Range;
  unit?: string;
  step?: number;
  onCommit: (v: number) => void;
  hint?: ReactNode;
  testId?: string;
  integer?: boolean;
  allowZero?: boolean;
}

/**
 * Numeričko polje sa jedinicom. Važeće vrednosti se primenjuju odmah (bez dugmeta „Primeni").
 * Neispravne vrednosti se NE primenjuju i NE menjaju potajno — prikazuje se objašnjenje.
 */
export function NumberField({ label, value, range, unit = 'mm', step = 10, onCommit, hint, testId, integer = true, allowZero }: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!focused.current) { setText(String(value)); setError(null); }
  }, [value]);

  const evaluate = (raw: string, final: boolean) => {
    const num = Number(raw.replace(',', '.').trim());
    const r = raw.trim() === '' ? { ok: false, message: `${label}: unesite broj.` } : validateRange(num, allowZero ? { ...range, min: 0 } : range, label, unit);
    if (r.ok) {
      setError(null);
      const v = integer ? Math.round(num) : num;
      if (v !== value) onCommit(v);
    } else if (final) {
      setError(`${r.message} Vrednost nije primenjena (važi ${value} ${unit}).`);
    }
    return r.ok;
  };

  const onChange = (raw: string) => {
    setText(raw);
    if (timer.current) clearTimeout(timer.current);
    const ok = evaluate(raw, false);
    if (!ok) timer.current = setTimeout(() => evaluate(raw, true), 700);
    else setError(null);
  };

  const bump = (dir: 1 | -1, big: boolean) => {
    const cur = Number(text.replace(',', '.'));
    const base = Number.isFinite(cur) ? cur : value;
    onChange(String(Math.round((base + dir * step * (big ? 10 : 1)) * 100) / 100));
  };

  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <div className="relative">
        <input
          id={id}
          data-testid={testId}
          className="input pr-11 tabular-nums"
          inputMode="decimal"
          aria-invalid={error ? true : undefined}
          value={text}
          onFocus={() => { focused.current = true; }}
          onBlur={() => {
            focused.current = false;
            if (timer.current) clearTimeout(timer.current);
            const ok = evaluate(text, true);
            if (ok) setText(String(value === Number(text) ? value : Number(text.replace(',', '.'))));
          }}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') { e.preventDefault(); bump(1, e.shiftKey); }
            if (e.key === 'ArrowDown') { e.preventDefault(); bump(-1, e.shiftKey); }
            if (e.key === 'Escape') { setText(String(value)); setError(null); (e.target as HTMLInputElement).blur(); e.stopPropagation(); }
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">{unit}</span>
      </div>
    </Field>
  );
}

export function SelectField<T extends string>({ label, value, options, onChange, hint, testId, disabled, stacked }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; hint?: ReactNode; testId?: string; disabled?: boolean; stacked?: boolean }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id} stacked={stacked}>
      <select id={id} data-testid={testId} className="input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function ToggleField({ label, checked, onChange, onLabel = 'Da', offLabel = 'Ne', testId }: { label: string; checked: boolean; onChange: (v: boolean) => void; onLabel?: string; offLabel?: string; testId?: string }) {
  return (
    <Field label={label}>
      <button type="button" role="switch" aria-checked={checked} data-testid={testId} onClick={() => onChange(!checked)} className="inline-flex items-center gap-2 text-sm">
        <span className={`relative inline-block w-10 h-6 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-slate-300'}`}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
        </span>
        <span className="text-ink">{checked ? onLabel : offLabel}</span>
      </button>
    </Field>
  );
}

export function SegmentedField<T extends string>({ label, value, options, onChange, testId }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; testId?: string }) {
  return (
    <Field label={label}>
      <div className="flex w-full rounded-lg border border-line p-0.5 bg-slate-50" role="radiogroup" aria-label={label} data-testid={testId}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
            className={`flex-1 min-w-0 px-2 py-1 text-[13px] rounded-md font-medium truncate ${value === o.value ? 'bg-white shadow-sm text-primary' : 'text-muted hover:text-ink'}`}>
            {o.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

/**
 * Izbor boje: pet boja za brzi izbor i jedan kružić sa trenutnom bojom. Klik na trenutnu boju otvara kartu boja (sve RAL boje),
 * gde se može promeniti i koje se boje nude u brzom izboru. Ispod je završna obrada (mat / sjaj / struktura), ako je polje podržava.
 */
export function ColorField({ label = 'Boja', value, onChange, testId, finish, onFinishChange }: {
  label?: string; value: string; onChange: (key: string) => void; testId?: string; stacked?: boolean;
  finish?: Finish; onFinishChange?: (f: Finish) => void;
}) {
  const favorites = normalizeFavorites(useAppStore((s) => s.settings.favoriteColors));
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [chart, setChart] = useState(false);
  const known = value === '' || value.startsWith('#') || !!colorInfo(value);
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="label">{label}</span>
        <span className="text-[12px] text-slate-600 tabular-nums" data-testid={testId ? `${testId}-value` : undefined}>{value ? colorText(value, finish) : 'različite boje'}</span>
      </div>
      <div className="flex items-center gap-1.5" role="radiogroup" aria-label={label} data-testid={testId}>
        {favorites.map((k) => {
          const on = k === value;
          return (
            <button key={k} type="button" role="radio" aria-checked={on} aria-label={k} title={`${k}${colorInfo(k)?.name && colorInfo(k)!.name !== k ? ` — ${colorInfo(k)!.name}` : ''}`} data-color={k}
              onClick={() => onChange(k)}
              className={`w-7 h-7 rounded-full shrink-0 transition-shadow ${on ? 'ring-2 ring-primary ring-offset-2' : 'ring-1 ring-black/15 hover:ring-2 hover:ring-slate-400'}`}
              style={{ background: swatchBackground(k) }} />
          );
        })}
        <span className="w-px h-6 bg-line mx-1" aria-hidden="true" />
        {/* trenutna boja: klik otvara kartu boja */}
        <button type="button" data-testid={testId ? `${testId}-current` : 'color-current'} aria-label={`Trenutna boja${value ? `: ${value}` : ''}. Otvori kartu boja`} title="Trenutna boja — klik otvara kartu boja"
          onClick={() => setChart(true)}
          className="w-9 h-9 rounded-full shrink-0 ring-2 ring-slate-500 ring-offset-2 hover:ring-primary transition-shadow grid place-items-center"
          style={{ background: value ? swatchBackground(value) : 'conic-gradient(#d71920,#f59e0b,#16a34a,#2563eb,#7c3aed,#d71920)' }}>
          {!value && <span className="sr-only">različite boje</span>}
        </button>
      </div>
      {onFinishChange && (
        <div className="flex items-center justify-between gap-2 mt-2" data-testid={testId ? `${testId}-finish` : undefined}>
          <span className="text-[12px] text-slate-600">Završna obrada</span>
          <div className="inline-flex rounded-lg border border-line p-0.5 bg-slate-50" role="radiogroup" aria-label="Završna obrada">
            {FINISHES.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={finish === f.id} data-finish={f.id} onClick={() => onFinishChange(f.id)}
                className={`px-2.5 py-1 text-[12.5px] rounded-md font-medium ${finish === f.id ? 'bg-white shadow-sm text-primary' : 'text-muted hover:text-ink'}`}>{f.label}</button>
            ))}
          </div>
        </div>
      )}
      {!known && <div className="text-[11.5px] text-muted mt-1">Boja nije na karti boja.</div>}
      {chart && <ColorChartModal value={value} finish={finish} favorites={favorites} onPick={onChange} onFinish={onFinishChange} onFavorites={(list) => updateSettings({ favoriteColors: list })} onClose={() => setChart(false)} />}
    </div>
  );
}

export function TextField({ label, value, onChange, placeholder, testId, multiline }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; testId?: string; multiline?: boolean }) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      {multiline
        ? <textarea id={id} data-testid={testId} className="input min-h-[64px]" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        : <input id={id} data-testid={testId} className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

/**
 * Polje za cenu u izabranoj valuti: cena se čuva u dinarima, a prikazuje i unosi u valuti iz podešavanja (evri preračunati po
 * kursu). Dok se kuca, tekst se ne prepisuje (decimale ostaju), a izmena se upisuje čim je broj ispravan.
 */
export function PriceInput({ rsd, onChange, label, testId, className = '' }: { rsd: number; onChange: (rsd: number) => void; label: string; testId?: string; className?: string }) {
  const currency = useAppStore((s) => s.settings.currency);
  const rate = useAppStore((s) => s.settings.currencyRateToEur);
  const shown = toCurrency(rsd, currency, rate);
  const [text, setText] = useState(String(shown));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(String(shown)); }, [shown]);
  return (
    <input aria-label={label} data-testid={testId} type="number" min={0} step={currency === 'EUR' ? 0.01 : 1} className={`input text-right tabular-nums ${className}`} value={text}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; setText(String(toCurrency(rsd, currency, rate))); }}
      onChange={(e) => { setText(e.target.value); const v = Number(e.target.value); if (e.target.value.trim() !== '' && Number.isFinite(v) && v >= 0) onChange(fromCurrency(v, currency, rate)); }} />
  );
}
