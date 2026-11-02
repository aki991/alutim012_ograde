import { useMemo, useState } from 'react';
import { applyImport, BIG_CHANGE_PERCENT, documentHasNewColumns, planImport, type ImportStatus } from '../../domain/pricing/materialsIo';
import { useAppStore } from '../../store/useAppStore';
import { fmtNum } from '../../utils/units';
import { Modal } from '../ui/Modal';

const STATUS_LABEL: Record<ImportStatus, string> = { changed: 'Menja se', same: 'Isto', new: 'Novi', unknown: 'Nije u cenovniku', error: 'Greška' };
const STATUS_CLASS: Record<ImportStatus, string> = {
  changed: 'bg-[#fef3c7] text-[#b45309]', same: 'bg-slate-100 text-slate-600', new: 'bg-[#dcfce7] text-[#15803d]', unknown: 'bg-slate-100 text-slate-500', error: 'bg-[#fef3f2] text-[#b42318]',
};

/** Uvoz cenovnika iz PDF, Excel (.xlsx) ili CSV dokumenta: prvo pregled izmena (stara → nova cena), pa tek onda primena. */
export function MaterialsImportModal({ fileName, table, onClose }: { fileName: string; table: string[][]; onClose: () => void }) {
  const materials = useAppStore((s) => s.materials);
  const currency = useAppStore((s) => s.settings.currency);
  const [addNew, setAddNew] = useState(() => documentHasNewColumns(table));
  const plan = useMemo(() => planImport(materials, table, addNew), [materials, table, addNew]);
  const [showAll, setShowAll] = useState(false);
  const applicable = plan.counts.changed + plan.counts.new;
  const big = plan.rows.filter((r) => r.status === 'changed' && r.oldPrice && r.newPrice !== undefined && Math.abs((r.newPrice - r.oldPrice) / r.oldPrice) * 100 >= BIG_CHANGE_PERCENT).length;
  const visible = plan.rows.filter((r) => showAll || r.status !== 'same');

  const apply = () => {
    useAppStore.getState().setMaterials(applyImport(materials, plan));
    onClose();
  };

  return (
    <Modal
      title="Uvoz cenovnika"
      width={920}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button className="btn" onClick={onClose} data-testid="import-cancel">Otkaži</button>
          <button className="btn btn-primary" onClick={apply} disabled={!!plan.fatal || applicable === 0} data-testid="import-apply">
            {applicable > 0 ? `Primeni izmene (${applicable})` : 'Nema izmena za primenu'}
          </button>
        </div>
      }
    >
      <div data-testid="import-preview">
        <p className="text-sm text-muted mb-2">Dokument: <b className="text-ink">{fileName}</b>. Redovi se uparuju po ID-u, ili po šifri. Menjaju se samo cena i otpad; ostalo ostaje isto. Izmene cenovnika važe za sve projekte i ne mogu se poništiti, pa pre toga izvezite trenutni cenovnik kao rezervnu kopiju.</p>
        {plan.fatal ? (
          <p className="text-sm text-[#b42318] rounded-md bg-[#fef3f2] border border-[#fecdca] px-3 py-2" role="alert" data-testid="import-fatal">{plan.fatal}</p>
        ) : (
          <>
            <p className="text-sm rounded-md bg-[#fffaeb] border border-[#fedf89] text-[#93370d] px-3 py-2 mb-3" data-testid="import-summary">
              <b>Šta će se promeniti:</b> {plan.counts.changed} {plan.counts.changed === 1 ? 'cena' : 'cena'} postojećih materijala
              {addNew ? `, ${plan.counts.new} novih materijala biće dodato` : ''}
              {plan.counts.unknown + plan.counts.error > 0 ? `; ${plan.counts.unknown + plan.counts.error} redova se preskače` : ''}. Ništa se ne menja dok ne kliknete „Primeni izmene".
            </p>
            {big > 0 && (
              <p className="text-sm rounded-md bg-[#fef3f2] border border-[#fecdca] text-[#b42318] px-3 py-2 mb-3" data-testid="import-big">
                <b>Pažnja:</b> {big} {big === 1 ? 'cena se menja' : 'cena se menja'} za {BIG_CHANGE_PERCENT}% ili više (označeno crveno u tabeli). Proverite da li dobavljač daje cenu u istoj jedinici (po metru, komadu, šipki od 6 m) i da li je cena bez PDV-a.
              </p>
            )}
            <div className="flex flex-wrap gap-2 mb-3 text-[13px]" data-testid="import-counts">
              {(['changed', 'same', 'new', 'unknown', 'error'] as ImportStatus[]).filter((s) => plan.counts[s] > 0 || s === 'changed').map((s) => (
                <span key={s} className={`pill ${STATUS_CLASS[s]}`}>{STATUS_LABEL[s]}: {plan.counts[s]}</span>
              ))}
            </div>
            <div className="flex flex-wrap gap-4 mb-2 text-sm">
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={addNew} onChange={(e) => setAddNew(e.target.checked)} data-testid="import-add-new" />Dodaj i materijale kojih nema u cenovniku (traži šifru, naziv i jedinicu)</label>
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />Prikaži i nepromenjene</label>
            </div>
            <div className="overflow-auto max-h-[46vh] border border-line rounded-lg">
              <table className="w-full min-w-[720px]" data-testid="import-table">
                <thead><tr><th className="th">Red</th><th className="th">Šifra</th><th className="th">Naziv</th><th className="th text-right">Stara cena</th><th className="th text-right">Nova cena</th><th className="th text-right">Promena</th><th className="th">Status</th></tr></thead>
                <tbody>
                  {visible.map((r) => {
                    const diff = r.oldPrice !== undefined && r.newPrice !== undefined && r.oldPrice > 0 ? ((r.newPrice - r.oldPrice) / r.oldPrice) * 100 : null;
                    return (
                      <tr key={r.line} data-testid={`import-row-${r.status}`} className={diff !== null && r.status === 'changed' && Math.abs(diff) >= BIG_CHANGE_PERCENT ? 'bg-[#fef3f2]' : ''}>
                        <td className="td text-muted tabular-nums">{r.line}</td>
                        <td className="td text-xs">{r.sku}</td>
                        <td className="td">{r.name}{r.message && <div className="text-[12px] text-muted">{r.message}</div>}</td>
                        <td className="td text-right tabular-nums">{r.oldPrice !== undefined ? `${fmtNum(r.oldPrice, 2)} ${currency}` : '—'}</td>
                        <td className="td text-right tabular-nums font-medium">{r.newPrice !== undefined && r.status !== 'error' ? `${fmtNum(r.newPrice, 2)} ${currency}` : '—'}</td>
                        <td className={`td text-right tabular-nums ${diff !== null && diff > 0 ? 'text-[#b42318]' : diff !== null && diff < 0 ? 'text-[#15803d]' : ''}`}>{diff !== null && r.status === 'changed' ? `${diff > 0 ? '+' : ''}${fmtNum(diff, 1)} %` : ''}</td>
                        <td className="td"><span className={`pill ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                      </tr>
                    );
                  })}
                  {visible.length === 0 && <tr><td className="td text-muted" colSpan={7}>Nema izmena: sve cene u dokumentu su iste kao u cenovniku.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
