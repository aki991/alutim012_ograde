import { useEffect, useState } from 'react';
import { NumberField, SegmentedField, TextField, ToggleField } from '../../components/forms/Fields';
import { Page, PageHeader } from '../../components/ui/Common';
import { UsersAdmin } from '../../components/settings/UsersAdmin';
import { ConfirmDialog } from '../../components/ui/Modal';
import { useAuth } from '../../services/auth';
import { saveNow } from '../../services/persistence';
import { cutOptions } from '../../domain/pricing/cutting';
import { useAppStore } from '../../store/useAppStore';

/** Ime i prezime prijavljenog korisnika: čuva se u Supabase nalogu i prikazuje u meniju i na avataru. */
function AccountName() {
  const auth = useAuth();
  const [name, setName] = useState(auth.name ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const save = async () => {
    setState('saving');
    const err = await auth.updateName(name);
    setState(err ? 'error' : 'saved');
  };
  return (
    <div className="py-1.5">
      <div className="label mb-1">Ime i prezime ({auth.login})</div>
      <div className="flex gap-2">
        <input className="input" value={name} placeholder="npr. Andreja Milenković" data-testid="account-name" onChange={(e) => { setName(e.target.value); setState('idle'); }} onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} />
        <button className="btn" data-testid="account-name-save" disabled={state === 'saving' || name.trim() === (auth.name ?? '')} onClick={() => void save()}>{state === 'saving' ? 'Čuvanje…' : 'Sačuvaj'}</button>
      </div>
      {state === 'saved' && <div className="text-[12px] text-[#15803d] mt-1" role="status">Ime je sačuvano u nalogu.</div>}
      {state === 'error' && <div className="text-[12px] text-[#b42318] mt-1" role="alert">Ime nije sačuvano. Pokušajte ponovo.</div>}
    </div>
  );
}

export default function SettingsPage() {
  const [appVersion, setAppVersion] = useState<string | null>(null);
  useEffect(() => { void window.electronAPI?.getVersion().then(setAppVersion); }, []);
  const auth = useAuth();
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
      {/* parovi kartica slične visine u istom redu: firma i kalkulacija, pa sečenje i napredne opcije */}
      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <section className="card p-5">
          <h2 className="font-bold mb-2">Firma i korisnik</h2>
          <TextField label="Naziv firme" testId="set-company" value={settings.companyName} onChange={(v) => update({ companyName: v })} />
          <TextField label="Adresa" testId="set-company-address" value={settings.companyInfo?.address ?? ''} onChange={(v) => update({ companyInfo: { ...settings.companyInfo, address: v } })} />
          <TextField label="Telefon" testId="set-company-phone" value={settings.companyInfo?.phone ?? ''} onChange={(v) => update({ companyInfo: { ...settings.companyInfo, phone: v } })} />
          <TextField label="Email firme" testId="set-company-email" value={settings.companyInfo?.email ?? ''} onChange={(v) => update({ companyInfo: { ...settings.companyInfo, email: v } })} />
          <TextField label="PIB" testId="set-company-pib" value={settings.companyInfo?.pib ?? ''} onChange={(v) => update({ companyInfo: { ...settings.companyInfo, pib: v } })} />
          {auth.enabled && !auth.guest ? <AccountName /> : <TextField label="Korisnik" value={settings.userName} onChange={(v) => update({ userName: v })} />}
          <SegmentedField label="Valuta" value={settings.currency === 'EUR' ? 'EUR' : 'RSD'} options={[{ value: 'RSD', label: 'RSD' }, { value: 'EUR', label: 'EUR' }]} onChange={(v) => update({ currency: v })} />
          <NumberField label="Kurs (RSD za 1 €)" unit="RSD" value={settings.currencyRateToEur} range={{ min: 1, max: 1000 }} integer={false} step={0.1} onCommit={(v) => update({ currencyRateToEur: v })} />
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
        <section className="card p-5" data-testid="set-cutting">
          <h2 className="font-bold mb-1">Sečenje materijala (krojna lista)</h2>
          <p className="text-sm text-muted mb-2">Širina testere se dodaje na svaki rez, pa utiče na to koliko komada staje u jednu šipku i koliki je ostatak.</p>
          <NumberField label="Širina testere" testId="set-kerf" value={cutOptions(settings).kerfMm} range={{ min: 0, max: 50 }} allowZero integer={false} step={0.5} onCommit={(v) => update({ cutting: { ...cutOptions(settings), kerfMm: v } })} hint="Debljina lista testere (rez). Uobičajeno 2–4 mm." />
          <NumberField label="Dužina nabavne šipke" testId="set-stock" value={cutOptions(settings).stockMm} range={{ min: 500, max: 20000 }} onCommit={(v) => update({ cutting: { ...cutOptions(settings), stockMm: v } })} hint="Dužina cele šipke kako stiže od dobavljača (najčešće 6000 mm)." />
        </section>
        <section className="card p-5">
          <h2 className="font-bold mb-2">Napredne opcije</h2>
          <ToggleField label="Napredni prikaz dužina" checked={Boolean(settings.advancedLengths)} onLabel="Uključen" offLabel="Isključen" onChange={(v) => update({ advancedLengths: v })} testId="set-advanced" />
          <ToggleField label="Simulacija na fotografiji" checked={settings.photoSimEnabled !== false} onLabel="Uključena" offLabel="Isključena" onChange={(v) => update({ photoSimEnabled: v })} testId="set-photosim" />
        </section>
        {auth.enabled && !auth.guest && auth.role === 'admin' && <UsersAdmin />}
        <section className="card p-5 lg:col-span-2">
          <h2 className="font-bold mb-1">Podaci</h2>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => void saveNow()}>Sačuvaj sada</button>
          </div>
          {/* brisanje svih podataka je sklonjeno u zatvoren deo, da se ne klikne slučajno */}
          <details className="mt-3 rounded-lg border border-[#fecdca] bg-[#fffbfa] px-3 py-2" data-testid="danger-zone">
            <summary className="cursor-pointer text-[13px] font-semibold text-[#b42318]">Napredno: brisanje svih podataka</summary>
            <p className="text-[12.5px] text-slate-700 mt-2">Briše sve projekte, kupce, materijale i podešavanja na ovom računaru i vraća početne probne podatke. Koristi se samo za probu aplikacije.</p>
            <button className="btn btn-danger btn-sm mt-2" data-testid="btn-reset-demo" onClick={() => setConfirm(true)}>Obriši sve i vrati probne podatke</button>
          </details>
          {appVersion && <p className="text-sm text-muted mt-3" data-testid="app-version">Verzija aplikacije: {appVersion}</p>}
          {done && <p role="status" className="text-sm text-[#067647] mt-3">Podaci su obrisani i vraćeni probni podaci.</p>}
        </section>
      </div>
      {confirm && <ConfirmDialog title="Brisanje svih podataka" danger confirmLabel="Obriši sve" message="Svi projekti, kupci, materijali i podešavanja biće obrisani i zamenjeni početnim probnim podacima. Ovo se ne može poništiti." onCancel={() => setConfirm(false)} onConfirm={async () => { await resetDemo(); setConfirm(false); setDone(true); }} />}
    </Page>
  );
}
