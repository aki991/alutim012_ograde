import type { ReactNode } from 'react';

/** Uključivanje jedne opcije; višestruki izbori u spiskovima ostaju checkbox polja. */
export function Switch({ label, checked, onChange, disabled, testId, id, ariaLabel, title, className = '' }: {
  label: ReactNode; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean;
  testId?: string; id?: string; ariaLabel?: string; title?: string; className?: string;
}) {
  return <label className={`switch-label ${className}`} title={title}>
    <input type="checkbox" role="switch" id={id} checked={checked} aria-checked={checked} disabled={disabled} data-testid={testId}
      aria-label={ariaLabel} className="switch-control" onChange={(e) => onChange(e.target.checked)} />
    <span>{label}</span>
  </label>;
}
