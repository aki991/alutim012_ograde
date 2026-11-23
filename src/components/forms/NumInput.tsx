import { useEffect, useRef, useState } from 'react';

/** broj iz teksta: decimalni zarez ili tačka; prazno = nepoznato */
export function parseNum(t: string): number | null | 'bad' {
  const s = t.trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : 'bad';
}

export const showNum = (v: number | null | undefined, precision = 2): string => (v === null || v === undefined ? '' : String(Math.round(v * 10 ** precision) / 10 ** precision).replace('.', ','));

/** polje za broj koje dozvoljava praznu vrednost (nepoznato) i nulu; potvrđuje se na Enter ili izlazak iz polja */
export function NumInput({ value, onCommit, testId, placeholder, className = '', readOnly, ariaLabel, chain, precision = 2,
  id, min, max, required, integer, step, unit = '', onError, showError = true, onSame, selectOnFocus = true }: {
  value: number | null | undefined; onCommit: (v: number | null) => void; testId?: string; placeholder?: string; className?: string; readOnly?: boolean; ariaLabel?: string;
  /** polja sa istim nizom: Enter potvrđuje i prelazi na sledeće polje niza (brz unos mera sa terena) */
  chain?: string;
  precision?: number;
  id?: string; min?: number; max?: number; required?: boolean; integer?: boolean; step?: number; unit?: string;
  onError?: (error: string | null) => void; showError?: boolean; onSame?: () => void; selectOnFocus?: boolean;
}) {
  const [text, setText] = useState(showNum(value, precision));
  const [error, setError] = useState<string | null>(null);
  // „prljavo“ = radnik je kucao u polju od kada je ušao u njega. Samo tada se vrednost potvrđuje; inače polje uvek prikazuje
  // trenutnu vrednost (i kad je fokusirano), da izračunata kota ne ostane sa starim tekstom i ne upiše se kao ručna mera.
  const dirty = useRef(false);
  const skipBlur = useRef(false);
  // posle potvrde polje prikazuje vrednost koju je aplikacija stvarno prihvatila (npr. odbijena širina se vraća)
  const [rev, setRev] = useState(0);
  useEffect(() => { if (!dirty.current) setText(showNum(value, precision)); }, [value, rev, precision]);
  const report = (message: string | null) => { setError(message); onError?.(message); };
  const commit = () => {
    if (!dirty.current || readOnly) return true;
    const parsed = parseNum(text);
    if (parsed === 'bad' || (parsed === null && required)) { report('Unesite broj. Vrednost nije primenjena.'); return false; }
    const n = parsed !== null && integer ? Math.round(parsed) : parsed;
    if (n !== null && ((min !== undefined && n < min) || (max !== undefined && n > max))) {
      report(`Dozvoljeno ${min !== undefined ? `od ${showNum(min)}` : ''}${max !== undefined ? ` do ${showNum(max)}` : ''} ${unit}. Vrednost nije primenjena.`);
      return false;
    }
    report(null);
    dirty.current = false;
    if (n !== (value ?? null)) onCommit(n); else onSame?.();
    setRev((r) => r + 1);
    return true;
  };
  const cancel = () => { dirty.current = false; report(null); setText(showNum(value, precision)); };
  return (
    <span className="number-control">
    <input id={id} className={`input text-right tabular-nums ${className}`} inputMode="decimal" data-numeric-input data-dirty={dirty.current || undefined}
      data-testid={testId} data-chain={chain} aria-label={ariaLabel} aria-invalid={!!error || undefined}
      aria-describedby={error && showError && testId ? `${testId}-error` : undefined}
      value={text} placeholder={placeholder ?? '—'} readOnly={readOnly} title={error ?? (dirty.current ? 'Enter ili izlazak iz polja potvrđuje · Esc vraća prethodnu vrednost' : undefined)}
      onFocus={(e) => { if (selectOnFocus) e.target.select(); }} onChange={(e) => { dirty.current = true; report(null); setText(e.target.value); }}
      onBlur={() => { if (skipBlur.current) { skipBlur.current = false; return; } commit(); }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); return; }
        if (step !== undefined && !readOnly && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault(); const n = parseNum(text); const base = typeof n === 'number' ? n : value ?? 0;
          dirty.current = true; report(null); setText(showNum(base + step * (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1), precision)); return;
        }
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const el = e.target as HTMLInputElement;
        if (!commit()) return;
        // fokus prelazi odmah (sinhrono), da sledeći uneti broj ne završi u ovom polju; blur posle potvrde ne potvrđuje ponovo
        skipBlur.current = true;
        const all = chain ? [...document.querySelectorAll<HTMLInputElement>('input[data-chain]:not([readonly]):not([disabled])')].filter((input) => input.dataset.chain === chain && input.offsetParent !== null) : [];
        const next = all[all.indexOf(el) + 1];
        if (next) next.focus(); else el.blur();
      }} />
      {error && showError && <span id={testId ? `${testId}-error` : undefined} data-testid={testId ? `${testId}-error` : undefined} className="control-error" role="alert">{error}</span>}
    </span>
  );
}
