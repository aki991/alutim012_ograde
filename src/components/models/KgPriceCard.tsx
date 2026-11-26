import { useMemo, useState } from 'react';
import { PriceInput } from '../forms/Fields';
import { Switch } from '../ui/Switch';
import { KG_PRICE_GROUP_LABELS, currentKgPrice, kgPriceGroupOf, kgPriceReport, type KgPriceGroup } from '../../domain/pricing/kgPrice';
import { useAppStore } from '../../store/useAppStore';
import { fmtMoney } from '../../utils/units';

/**
 * Stranica Materijali i cene: jedna cena po kilogramu za čelične cevi (i po izboru U profile). Kad je uključena, cena svakog takvog
 * materijala (po metru, šipki …) računa se iz nje i mase, a izmena cene po kg odmah menja cene svih tih materijala.
 */
export function KgPriceCard() {
  const materials = useAppStore((s) => s.materials);
  const kg = useAppStore((s) => s.settings.kgPrice ?? null);
  const settings = useAppStore((s) => s.settings);
  const st = useAppStore.getState();
  const [showList, setShowList] = useState(false);
  const groups: KgPriceGroup[] = kg?.groups ?? ['tube', 'u'];
  const counts = useMemo(() => ({ tube: materials.filter((m) => kgPriceGroupOf(m) === 'tube').length, u: materials.filter((m) => kgPriceGroupOf(m) === 'u').length }), [materials]);
  const report = useMemo(() => (kg ? kgPriceReport(materials, kg) : null), [materials, kg]);
  const turnOn = (on: boolean) => {
    if (!on) { st.setKgPrice(null); return; }
    // predlog: najčešća postojeća cena po kg u izabranim grupama
    st.setKgPrice({ priceRsd: currentKgPrice(materials, groups) ?? 0, groups });
  };
  const setGroup = (g: KgPriceGroup, on: boolean) => {
    if (!kg) return;
    const next = on ? [...new Set([...kg.groups, g])] : kg.groups.filter((x) => x !== g);
    st.setKgPrice({ ...kg, groups: next });
  };
  return (
    <div className="card p-4 mb-4" data-testid="kg-price-card">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-[220px] flex-1">
          <div className="font-semibold">Cena po kilogramu za cevi</div>
          <p className="text-xs text-muted mt-0.5">Jedna cena po kg za sve čelične cevi{groups.includes('u') ? ' i U profile' : ''}. Cena po metru (ili šipki) svakog materijala se računa iz nje i mase; izmena cene po kg odmah menja sve te cene. Gotovi stubovi, aluminijum, inox i materijali za terase se ne menjaju; sirova cev za stubove se menja.</p>
        </div>
        <Switch ariaLabel="Cena po kilogramu za cevi" label={kg ? 'Uključeno' : 'Isključeno'} checked={!!kg} onChange={turnOn} testId="kg-price-toggle" />
        {kg && <label className="flex items-center gap-2 text-sm"><span>Cena po kg</span><span className="w-[150px]"><PriceInput label="Cena po kilogramu" testId="kg-price-value" precision={2} rsd={kg.priceRsd} onChange={(v) => st.setKgPrice({ ...kg, priceRsd: v })} /></span></label>}
      </div>
      {kg && report && (
        <div className="mt-3 text-sm">
          <div className="flex flex-wrap gap-4 mb-2">
            {(['tube', 'u'] as const).map((g) => (
              <label key={g} className="flex items-center gap-2">
                <input type="checkbox" data-testid={`kg-price-group-${g}`} checked={kg.groups.includes(g)} onChange={(e) => setGroup(g, e.target.checked)} />
                {KG_PRICE_GROUP_LABELS[g]} ({counts[g]})
              </label>
            ))}
          </div>
          <p className="text-[12.5px]" data-testid="kg-price-summary">
            Cena iz cene po kg: <b>{report.priced.length}</b> materijala.
            {report.estimated.length > 0 && <> Za <b>{report.estimated.length}</b> je masa procenjena (cena je približna dok se ne upiše masa iz deklaracije).</>}
            {report.noMass.length > 0 && <span className="text-[#b42318]"> Bez mase, cena ostaje ručna: {report.noMass.map((m) => m.name).join(', ')}.</span>}
            {' '}<button className="text-primary font-semibold" onClick={() => setShowList((v) => !v)} data-testid="kg-price-list-toggle">{showList ? 'Sakrij spisak' : 'Prikaži spisak'}</button>
          </p>
          {showList && (
            <table className="mt-2 text-[12.5px]" data-testid="kg-price-list"><tbody>
              {report.priced.map((m) => (
                <tr key={m.id}><td className="pr-4 py-0.5">{m.name}</td><td className="pr-4 py-0.5 text-right tabular-nums">{fmtMoney(m.unitPrice, settings.currency, settings.currencyRateToEur)} / {m.unit}</td><td className="py-0.5 text-muted">{m.massSource === 'estimated' ? 'masa procenjena' : ''}</td></tr>
              ))}
            </tbody></table>
          )}
        </div>
      )}
    </div>
  );
}
