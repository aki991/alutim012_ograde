import type { ReactNode } from 'react';
import { SelectField } from './Fields';

export function ScopeField<T extends string>({ value, options, onChange, count, testId, hint }: {
  value: T; options: { value: T; label: string }[]; onChange: (value: T) => void;
  count: number; testId: string; hint?: ReactNode;
}) {
  return <div className="scope-field">
    <SelectField stacked label="Izmene važe za" testId={testId} value={value} options={options} onChange={onChange} />
    <p className="text-[12px] text-muted" data-testid={`${testId}-count`}>Broj obuhvaćenih elemenata: <b className="text-ink">{count}</b></p>
    {hint && <p className="text-[12px] text-muted mt-1">{hint}</p>}
  </div>;
}
