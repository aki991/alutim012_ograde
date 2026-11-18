import { FINISHING_NOTE, finishingArea, finishingMass, finishingMissing, type FinishingSummary as Summary } from '../../domain/pricing/finishing';

export function FinishingSummary({ value, testId = 'finishing-summary' }: { value: Summary; testId?: string }) {
  const warnings = finishingMissing(value);
  return (
    <div className="mt-4 rounded-xl border border-line bg-bg p-4" data-testid={testId}>
      <h3 className="font-bold mb-2">Materijal za plastifikaciju</h3>
      <div className="flex flex-wrap gap-x-10 gap-y-2">
        <div><div className="text-xs text-muted">Površina za plastificiranje</div><b className="text-xl tabular-nums" data-testid={`${testId}-area`}>{finishingArea(value)}</b></div>
        <div><div className="text-xs text-muted">Ukupna masa materijala</div><b className="text-xl tabular-nums" data-testid={`${testId}-mass`}>{finishingMass(value)}</b></div>
      </div>
      <p className="mt-2 text-xs text-muted">{FINISHING_NOTE}</p>
      {warnings.map((w) => <p key={w} className="mt-1 text-xs text-[#b42318]" role="alert">{w}</p>)}
    </div>
  );
}
