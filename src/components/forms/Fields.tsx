import { useId, useState, type ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import { colorInfo, colorText, FINISHES } from '../../domain/models/catalog';
import type { Finish } from '../../domain/models/types';
import { useAppStore } from '../../store/useAppStore';
import { ColorChartModal, normalizeFavorites, swatchBackground } from './ColorChartModal';
import { type Range } from '../../domain/validation/limits';
import { fromCurrency, toCurrency } from '../../utils/units';
import { NumInput } from './NumInput';
import { Switch } from '../ui/Switch';
import { ChoiceGroup } from '../ui/ChoiceGroup';

export function Field({ label, children, hint, help, error, htmlFor, stacked }: { label: string; children: ReactNode; hint?: ReactNode; help?: string; error?: string | null; htmlFor?: string; stacked?: boolean }) {
  return (
    <div className={`grid ${stacked ? 'grid-cols-1' : 'grid-cols-[minmax(0,0.8fr)_minmax(0,1.45fr)]'} items-center gap-x-3 gap-y-1 py-1.5`}>
      {help ? <div className="flex items-center gap-1.5 min-w-0">
        <label className="label" htmlFor={htmlFor}>{label}</label>
        <button type="button" className="shrink-0 text-muted hover:text-slate-800 rounded-full focus-visible:outline-2 focus-visible:outline-primary" aria-label={`Pomoć: ${label}`} title={help}><CircleHelp size={16} /></button>
      </div> : <label className="label" htmlFor={htmlFor}>{label}</label>}
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
  help?: string;
  testId?: string;
  integer?: boolean;
  allowZero?: boolean;
}

/** Mere se potvrđuju na Enter ili izlazak iz polja; Escape vraća trenutnu prihvaćenu vrednost. */
export function NumberField({ label, value, range, unit = 'mm', step = 10, onCommit, hint, help, testId, integer = true, allowZero }: NumberFieldProps) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  return <Field label={label} hint={hint} help={help} error={error} htmlFor={id}>
    <div className="relative">
      <NumInput id={id} value={value} testId={testId} min={allowZero ? 0 : range.min} max={range.max} required integer={integer}
        step={step} unit={unit} className="!pr-12" onError={setError} showError={false} selectOnFocus={false}
        onCommit={(v) => { if (v !== null) onCommit(v); }} />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">{unit}</span>
    </div>
  </Field>;
}

export function SelectField<T extends string>({ label, value, options, onChange, hint, testId, disabled, stacked }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; hint?: ReactNode; testId?: string; disabled?: boolean; stacked?: boolean }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id} stacked={stacked}>
      <select id={id} data-testid={testId} className="input" title={options.find((o) => o.value === value)?.label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function ToggleField({ label, checked, onChange, onLabel = 'Da', offLabel = 'Ne', testId, help }: { label: string; checked: boolean; onChange: (v: boolean) => void; onLabel?: string; offLabel?: string; testId?: string; help?: string }) {
  const id = useId();
  return <Field label={label} htmlFor={id} help={help}>
    <Switch id={id} ariaLabel={label} label={checked ? onLabel : offLabel} checked={checked} onChange={onChange} testId={testId} />
  </Field>;
}

export function SegmentedField<T extends string>({ label, value, options, onChange, testId }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; testId?: string }) {
  return <Field label={label}><ChoiceGroup label={label} value={value} options={options} onChange={onChange} testId={testId} className="w-full" /></Field>;
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
          <ChoiceGroup label="Završna obrada" value={finish ?? ''} onChange={onFinishChange} className="finish-choices"
            options={FINISHES.map((f) => ({ value: f.id, label: f.label }))} />
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

/** Cena se unosi u izabranoj valuti, a čuva u dinarima. Ista potvrda i otkazivanje kao kod mera. */
export function PriceInput({ rsd, onChange, label, testId, className = '', precision }: { rsd: number; onChange: (rsd: number) => void; label: string; testId?: string; className?: string; precision?: number }) {
  const currency = useAppStore((s) => s.settings.currency);
  const rate = useAppStore((s) => s.settings.currencyRateToEur);
  const raw = toCurrency(rsd, currency, rate);
  const shown = precision === undefined ? raw : Math.round(raw * 10 ** precision) / 10 ** precision;
  return <NumInput ariaLabel={label} testId={testId} className={className} value={shown} required min={0}
    precision={precision ?? 2} step={currency === 'EUR' ? 0.01 : 1} unit={currency}
    onCommit={(v) => { if (v !== null) onChange(fromCurrency(v, currency, rate)); }} />;
}
