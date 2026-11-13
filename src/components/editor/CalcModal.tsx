import { useMemo } from 'react';
import { buildBom, computePrice } from '../../domain/pricing/calc';
import type { Project } from '../../domain/models/types';
import { useAppStore } from '../../store/useAppStore';
import { fmtMoney, fmtNum } from '../../utils/units';
import { NumberField, SegmentedField, ToggleField } from '../forms/Fields';
import { Modal } from '../ui/Modal';
import { LIMITS } from '../../domain/validation/limits';

export function CalcModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const materials = useAppStore((s) => s.materials);
  const specs = useAppStore((s) => s.settings.modelSpecs);
  const settings = useAppStore((s) => s.settings);
  const mutate = useAppStore((s) => s.mutate);
  const upsertMaterial = useAppStore((s) => s.upsertMaterial);
  const bom = useMemo(() => buildBom(project, materials, specs), [project, materials, specs]);
  const price = useMemo(() => computePrice(project, materials, specs), [project, materials, specs]);
  const pr = project.settings.pricing;
  const money = (n: number) => fmtMoney(n, settings.currency, settings.currencyRateToEur);
  const setPricing = (patch: Partial<typeof pr>, key?: string) => mutate((p) => ({ ...p, updatedAt: new Date().toISOString(), settings: { ...p.settings, pricing: { ...p.settings.pricing, ...patch } } }), key ?? null);
  const empty = project.items.length === 0;

  return (
    <Modal
      title="Kalkulacija materijala i cene"
      width={1120}
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto text-sm text-muted">Ukupno sa PDV-om:&nbsp;<b className="text-ink text-lg tabular-nums" data-testid="calc-total-footer">{money(price.grossTotal)}</b></span>
          <button className="btn btn-primary" onClick={onClose} data-testid="calc-close" data-autofocus>Zatvori</button>
        </>
      }
    >
      {empty && <div className="rounded-lg bg-slate-50 border border-line px-4 py-6 text-center text-sm text-muted mb-4" data-testid="calc-empty">Projekat je prazan — nema materijala ni cene. Dodajte elemente da biste dobili obračun.</div>}
      <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)] gap-6">
        <div className="min-w-0">
          <h3 className="font-semibold mb-2">Spisak materijala</h3>
          <table className="w-full table-fixed" data-testid="calc-bom">
            <colgroup><col /><col className="w-[84px]" /><col className="w-[104px]" /><col className="w-[104px]" /></colgroup>
            <thead><tr><th className="th">Stavka</th><th className="th text-right">Količina</th><th className="th text-right">Cena/JM</th><th className="th text-right">Ukupno</th></tr></thead>
            <tbody>
              {bom.map((l) => {
                const mat = materials.find((m) => m.id === l.materialId);
                return (
                  <tr key={l.key}>
                    <td className="td !px-2"><div className="font-medium text-[13px] leading-snug break-words">{l.name}</div><div className="text-[11px] text-muted">{l.group} · {l.sku}</div></td>
                    <td className="td !px-2 text-right tabular-nums text-[13px]" title={`Geometrijski: ${fmtNum(l.geometricQty, 2)} ${l.unit}`}>{fmtNum(l.purchaseQty, l.unit === 'kom' ? 0 : 2)}<span className="text-muted"> {l.unit}</span></td>
                    <td className="td !px-2 text-right">
                      {mat ? (
                        <input aria-label={`Cena: ${l.name}`} data-testid={`price-input-${mat.id}`} type="number" min={0} className="input !py-1 !px-2 text-right tabular-nums" defaultValue={mat.unitPrice}
                          onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) upsertMaterial({ ...mat, unitPrice: v }); }} />
                      ) : <span className="text-[13px] tabular-nums">{fmtNum(l.unitPriceNet, 2)}</span>}
                    </td>
                    <td className="td !px-2 text-right tabular-nums font-semibold text-[13px]">{fmtNum(l.total, 0)}</td>
                  </tr>
                );
              })}
              <tr className="bg-slate-50 font-semibold"><td className="td !px-2" colSpan={3}>Materijal ukupno (neto, {settings.currency})</td><td className="td !px-2 text-right tabular-nums">{fmtNum(price.materialTotal, 0)}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="min-w-0">
          <h3 className="font-semibold mb-1">Obračun</h3>
          <table className="w-full mb-3" data-testid="calc-breakdown">
            <tbody>
              {price.rows.map((r) => (
                <tr key={r.label} className={r.emphasis ? 'bg-slate-50' : ''}>
                  <td className={`py-1.5 px-2 text-[13px] ${r.emphasis ? 'font-semibold' : ''}`}>{r.label}<div className="text-[10.5px] text-muted font-normal">{r.base}</div></td>
                  <td className={`py-1.5 px-2 text-right tabular-nums text-[13px] whitespace-nowrap ${r.emphasis ? 'font-bold' : ''}`}>{money(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="rounded-lg bg-primary-50 px-3 py-3 flex justify-between items-baseline mb-4"><b>Ukupno sa PDV-om</b><b className="text-xl tabular-nums" data-testid="calc-total">{money(price.grossTotal)}</b></div>

          <h3 className="font-semibold mb-1">Parametri cene</h3>
          <SegmentedField label="Zarada" value={pr.profitMode} options={[{ value: 'margin', label: 'Marža' }, { value: 'markup', label: 'Uvećanje' }]} onChange={(v) => setPricing({ profitMode: v })} testId="profit-mode" />
          <NumberField label={pr.profitMode === 'margin' ? 'Marža' : 'Uvećanje'} unit="%" value={pr.profitPercent} range={{ min: 0, max: 99 }} allowZero integer={false} step={1} onCommit={(v) => setPricing({ profitPercent: v }, 'pp')} />
          <NumberField label="Popust" unit="%" value={pr.discountPercent} range={LIMITS.percent} allowZero integer={false} step={1} onCommit={(v) => setPricing({ discountPercent: v }, 'dp')} />
          <NumberField label="PDV" unit="%" value={pr.vatPercent} range={LIMITS.percent} allowZero integer={false} step={1} onCommit={(v) => setPricing({ vatPercent: v }, 'vat')} />
          <ToggleField label="Cene su bruto" checked={pr.pricesIncludeVat} onLabel="Sa PDV-om" offLabel="Bez PDV-a" onChange={(v) => setPricing({ pricesIncludeVat: v })} />
          <NumberField label="Rad po m²" unit={`${settings.currency}/m²`} value={pr.laborPerM2Rsd} range={{ min: 0, max: 100000 }} allowZero onCommit={(v) => setPricing({ laborPerM2Rsd: v }, 'l1')} />
          <NumberField label="Rad po kapiji" unit={settings.currency} value={pr.laborPerGateRsd} range={{ min: 0, max: 500000 }} allowZero onCommit={(v) => setPricing({ laborPerGateRsd: v }, 'l2')} />
          <NumberField label="Montaža po m" unit={`${settings.currency}/m`} value={pr.installPerMeterRsd} range={{ min: 0, max: 100000 }} allowZero onCommit={(v) => setPricing({ installPerMeterRsd: v }, 'i1')} />
          <NumberField label="Montaža po kapiji" unit={settings.currency} value={pr.installPerGateRsd} range={{ min: 0, max: 500000 }} allowZero onCommit={(v) => setPricing({ installPerGateRsd: v }, 'i2')} />
        </div>
      </div>
    </Modal>
  );
}
