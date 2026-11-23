import type { ReactNode } from 'react';

/** Jedan izbor među nekoliko ravnopravnih mogućnosti. Strelice, Home i End menjaju izbor. */
export function ChoiceGroup<T extends string>({ label, value, options, onChange, testId, className = '', kind = 'radio' }: {
  label: string; value: T | ''; options: { value: T; label: ReactNode; testId?: string; disabled?: boolean; className?: string; title?: string }[];
  onChange: (value: T) => void; testId?: string; className?: string; kind?: 'radio' | 'tabs';
}) {
  const selected = options.findIndex((o) => o.value === value && !o.disabled);
  const first = options.findIndex((o) => !o.disabled);
  return <div className={`choice-group ${className}`} role={kind === 'tabs' ? 'tablist' : 'radiogroup'} aria-label={label} data-testid={testId}>
    {options.map((o, index) => <button type="button" key={o.value} role={kind === 'tabs' ? 'tab' : 'radio'}
      aria-checked={kind === 'radio' ? o.value === value : undefined} aria-selected={kind === 'tabs' ? o.value === value : undefined}
      disabled={o.disabled} tabIndex={index === (selected < 0 ? first : selected) ? 0 : -1}
      data-testid={o.testId} title={o.title} className={`choice-option ${o.className ?? ''}`} onClick={() => onChange(o.value)}
      onKeyDown={(e) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        const root = e.currentTarget.parentElement;
        const enabled = options.map((v, i) => ({ ...v, index: i })).filter((v) => !v.disabled && (root?.children[v.index] as HTMLElement)?.offsetParent !== null);
        if (!enabled.length) return;
        const at = enabled.findIndex((v) => v.index === index);
        const next = e.key === 'Home' ? enabled[0] : e.key === 'End' ? enabled[enabled.length - 1]
          : enabled[(at + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + enabled.length) % enabled.length];
        (e.currentTarget.parentElement?.children[next.index] as HTMLButtonElement)?.focus();
        onChange(next.value);
      }}>{o.label}</button>)}
  </div>;
}
