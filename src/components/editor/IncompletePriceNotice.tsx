import { AlertTriangle } from 'lucide-react';

export function IncompletePriceNotice({ count }: { count: number }) {
  if (!count) return null;
  return <div role="note" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 p-2.5 text-[12px] my-2" data-testid="incomplete-price">
    <AlertTriangle size={16} className="shrink-0 mt-0.5" />
    <span><b>Obračun nije potpun.</b> Broj stavki materijala bez cene ili sa cenom 0: <b>{count}</b>. Ukupan iznos uključuje samo unete cene.</span>
  </div>;
}
