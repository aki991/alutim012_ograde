import { CheckCircle2, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Material, Project } from '../../domain/models/types';
import { materialName } from '../../domain/models/spec';
import { bookProjectStock } from '../../domain/pricing/stockBooking';
import { useAppStore } from '../../store/useAppStore';
import { fmtNum } from '../../utils/units';
import { ConfirmDialog } from '../ui/Modal';

/**
 * „Potvrdi sečenje“: knjiži krojnu listu u magacin odmah, nezavisno od statusa projekta. Komadi izabrani iz magacina nestaju sa stanja
 * (ta cev je potrošena), a ostaci posle sečenja ulaze na stanje. „Poništi sečenje“ sve vraća.
 */
export function ConfirmCuttingButton({ project, materials }: { project: Project; materials: Material[] }) {
  const settings = useAppStore((s) => s.settings);
  const confirmCutting = useAppStore((s) => s.confirmCutting);
  const undoCutting = useAppStore((s) => s.undoCutting);
  const booking = settings.stockBookings?.[project.id];
  const [dialog, setDialog] = useState<'confirm' | 'undo' | null>(null);
  // šta će knjiženje promeniti (samo za poruku u dijalogu)
  const preview = useMemo(() => (dialog === 'confirm' ? bookProjectStock(project, settings, materials).record : null), [dialog, project, settings, materials]); // eslint-disable-line react-hooks/exhaustive-deps
  const line = (o: { materialId: string; lengthMm: number; qty: number }) => `${materialName(materials, o.materialId)} · ${fmtNum(o.lengthMm, 0)} mm × ${o.qty}`;

  if (booking) {
    const removed = booking.removed.reduce((n, o) => n + o.qty, 0);
    const added = booking.added.reduce((n, o) => n + o.qty, 0);
    return (
      <>
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#15803d]" data-testid="cutting-confirmed" title={`Skinuto sa stanja: ${removed} kom · dodato ostataka: ${added} kom`}>
          <CheckCircle2 size={16} />Sečenje potvrđeno
        </span>
        <button className="btn" data-testid="cutting-undo" onClick={() => setDialog('undo')}><Undo2 size={16} />Poništi sečenje</button>
        {dialog === 'undo' && (
          <ConfirmDialog title="Poništi sečenje" confirmLabel="Poništi" onCancel={() => setDialog(null)} onConfirm={() => { undoCutting(project.id); setDialog(null); }}
            message={<>Komadi koje je ovaj projekat uzeo iz magacina vraćaju se na stanje ({removed} kom), a ostaci koje je dodao posle sečenja skidaju se sa stanja ({added} kom).</>} />
        )}
      </>
    );
  }

  return (
    <>
      <button className="btn" data-testid="cutting-confirm" onClick={() => setDialog('confirm')}><CheckCircle2 size={16} />Potvrdi sečenje</button>
      {dialog === 'confirm' && preview && (
        <ConfirmDialog title="Potvrdi sečenje" confirmLabel="Potvrdi sečenje" onCancel={() => setDialog(null)} onConfirm={() => { confirmCutting(project.id); setDialog(null); }}
          message={(
            <div className="space-y-2 text-[14px]">
              <p>Materijal ove krojne liste se knjiži u magacin. Možete ga poništiti dugmetom „Poništi sečenje“.</p>
              <div>
                <b>Skida se sa stanja:</b>
                {preview.removed.length ? <ul className="list-disc pl-5">{preview.removed.map((o, i) => <li key={i}>{line(o)}</li>)}</ul> : <div className="text-muted">ništa (nijedan komad iz magacina nije iskorišćen)</div>}
              </div>
              <div>
                <b>Dodaje se na stanje (ostaci posle sečenja):</b>
                {preview.added.length ? <ul className="list-disc pl-5">{preview.added.map((o, i) => <li key={i}>{line(o)}</li>)}</ul> : <div className="text-muted">ništa</div>}
              </div>
            </div>
          )} />
      )}
    </>
  );
}
