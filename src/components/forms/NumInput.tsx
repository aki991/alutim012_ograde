import { useEffect, useRef, useState } from 'react';

/** broj iz teksta: decimalni zarez ili tačka; prazno = nepoznato */
export function parseNum(t: string): number | null | 'bad' {
  const s = t.trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : 'bad';
}

export const showNum = (v: number | null | undefined): string => (v === null || v === undefined ? '' : String(Math.round(v * 100) / 100).replace('.', ','));

/** polje za broj koje dozvoljava praznu vrednost (nepoznato) i nulu; potvrđuje se na Enter ili izlazak iz polja */
export function NumInput({ value, onCommit, testId, placeholder, className = '', readOnly, ariaLabel, chain }: {
  value: number | null | undefined; onCommit: (v: number | null) => void; testId?: string; placeholder?: string; className?: string; readOnly?: boolean; ariaLabel?: string;
  /** polja sa istim nizom: Enter potvrđuje i prelazi na sledeće polje niza (brz unos mera sa terena) */
  chain?: string;
}) {
  const [text, setText] = useState(showNum(value));
  const [bad, setBad] = useState(false);
  // „prljavo“ = radnik je kucao u polju od kada je ušao u njega. Samo tada se vrednost potvrđuje; inače polje uvek prikazuje
  // trenutnu vrednost (i kad je fokusirano), da izračunata kota ne ostane sa starim tekstom i ne upiše se kao ručna mera.
  const dirty = useRef(false);
  const skipBlur = useRef(false);
  // posle potvrde polje prikazuje vrednost koju je aplikacija stvarno prihvatila (npr. odbijena širina se vraća)
  const [rev, setRev] = useState(0);
  useEffect(() => { if (!dirty.current) setText(showNum(value)); }, [value, rev]);
  const commit = () => {
    if (!dirty.current) return;
    const n = parseNum(text);
    if (n === 'bad') { setBad(true); return; }
    setBad(false);
    dirty.current = false;
    if (n !== (value ?? null)) onCommit(n);
    setRev((r) => r + 1);
  };
  return (
    <input className={`input !py-1 text-right tabular-nums ${bad ? '!border-[#d92d20]' : ''} ${className}`} inputMode="decimal" data-testid={testId} data-chain={chain} aria-label={ariaLabel} aria-invalid={bad || undefined} value={text} placeholder={placeholder ?? '—'} readOnly={readOnly}
      onFocus={(e) => { dirty.current = false; e.target.select(); }} onChange={(e) => { dirty.current = true; setText(e.target.value); }}
      onBlur={() => { if (skipBlur.current) { skipBlur.current = false; return; } commit(); }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const el = e.target as HTMLInputElement;
        commit();
        // fokus prelazi odmah (sinhrono), da sledeći uneti broj ne završi u ovom polju; blur posle potvrde ne potvrđuje ponovo
        skipBlur.current = true;
        const all = chain ? [...document.querySelectorAll<HTMLInputElement>(`input[data-chain="${chain}"]:not([readonly])`)] : [];
        const next = all[all.indexOf(el) + 1];
        if (next) next.focus(); else el.blur();
      }} />
  );
}
