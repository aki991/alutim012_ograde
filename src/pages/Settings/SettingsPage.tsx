import { useState } from 'react';
import { NumberField, SegmentedField, TextField, ToggleField } from '../../components/forms/Fields';
import { Page, PageHeader } from '../../components/ui/Common';
import { ConfirmDialog } from '../../components/ui/Modal';
import { saveNow } from '../../services/persistence';
import { useAppStore } from '../../store/useAppStore';

export default function SettingsPage() {
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);
  const resetDemo = useAppStore((s) => s.resetDemo);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const pr = settings.pricing;
  const setPr = (patch: Partial<typeof pr>) => update({ pricing: { ...pr, ...patch } });

  return (
    <Page>
      <PageHeader title="Podešavanja" subtitle="Opšta podešavanja aplikacije i podrazumevane vrednosti za nove projekte." />
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-bold mb-2">Firma i korisnik</h2>
          <TextField label="Naziv firme" testId="set-company" value={settings.companyName} onChange={(v) => update({ companyName: v })} />
          <TextField label="Korisnik" value={settings.userName} onChange={(v) => update({ userName: v })} />
          <SegmentedField label="Valuta" value={settings.currency === 'EUR' ? 'EUR' : 'RSD'} options={[{ value: 'RSD', label: 'RSD' }, { value: 'EUR', label: 'EUR' }]} onChange={(v) => update({ currency: v })} />
          <NumberField label="Kurs (RSD za 1 €)" unit="RSD" value={settings.currencyRateToEur} range={{ min: 1, max: 1000 }} integer={false} step={0.1} onCommit={(v) => update({ currencyRateToEur: v })} />
        </section>
        <section className="card p-5">
          <h2 className="font-bold mb-2">Napredne opcije</h2>
          <ToggleField label="Napredni prikaz dužina" checked={Boolean(settings.advancedLengths)} onLabel="Uključen" offLabel="Isključen" onChange={(v) => update({ advancedLengths: v })} testId="set-advanced" />
          <ToggleField label="Simulacija na fotografiji" checked={settings.photoSimEnabled !== false} onLabel="Uključena" offLabel="Isključena" onChange={(v) => update({ photoSimEnabled: v })} testId="set-photosim" />
        </section>
        <section className="card p-5">
          <h2 className="font-bold mb-2">Podrazumevana kalkulacija (novi projekti)</h2>
          <SegmentedField label="Zarada" value={pr.profitMode} options={[{ value: 'margin', label: 'Marža' }, { value: 'markup', label: 'Uvećanje' }]} onChange={(v) => setPr({ profitMode: v })} />
          <NumberField label={pr.profitMode === 'margin' ? 'Marža' : 'Uvećanje'} unit="%" value={pr.profitPercent} range={{ min: 0, max: 99 }} allowZero integer={false} step={1} onCommit={(v) => setPr({ profitPercent: v })} />
          <NumberField label="Popust" unit="%" value={pr.discountPercent} range={{ min: 0, max: 100 }} allowZero integer={false} step={1} onCommit={(v) => setPr({ discountPercent: v })} />
          <NumberField label="PDV" unit="%" value={pr.vatPercent} range={{ min: 0, max: 100 }} allowZero integer={false} step={1} onCommit={(v) => setPr({ vatPercent: v })} />
          <ToggleField label="Cene su bruto" checked={pr.pricesIncludeVat} onLabel="Sa PDV-om" offLabel="Bez PDV-a" onChange={(v) => setPr({ pricesIncludeVat: v })} />
          <NumberField label="Rad po m²" unit="RSD/m²" value={pr.laborPerM2Rsd} range={{ min: 0, max: 100000 }} allowZero onCommit={(v) => setPr({ laborPerM2Rsd: v })} />
          <NumberField label="Montaža po m" unit="RSD/m" value={pr.installPerMeterRsd} range={{ min: 0, max: 100000 }} allowZero onCommit={(v) => setPr({ installPerMeterRsd: v })} />
        </section>
        <section className="card p-5 lg:col-span-2">
          <h2 className="font-bold mb-1">Lokalni podaci</h2>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => void saveNow()}>Sačuvaj sada</button>
            <button className="btn btn-danger" data-testid="btn-reset-demo" onClick={() => setConfirm(true)}>Reset demonstracionih podataka</button>
          </div>
          {done && <p role="status" className="text-sm text-[#067647] mt-3">Demonstracioni podaci su vraćeni na početno stanje.</p>}
        </section>
      </div>
      {confirm && <ConfirmDialog title="Reset demonstracionih podataka" danger confirmLabel="Resetuj" message="Svi projekti, kupci, materijali i podešavanja biće zamenjeni početnim demonstracionim podacima. Ovo se ne može poništiti." onCancel={() => setConfirm(false)} onConfirm={async () => { await resetDemo(); setConfirm(false); setDone(true); }} />}
    </Page>
  );
}
