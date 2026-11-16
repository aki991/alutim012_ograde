import { ChevronDown, Download, PenTool, Ruler, FileSpreadsheet, FileText, Plus, Search, Trash2, Upload } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { NumberField, PriceInput, SelectField, TextField } from '../../components/forms/Fields';
import { NumInput } from '../../components/forms/NumInput';
import { DemoBadge, Page, PageHeader } from '../../components/ui/Common';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import type { Material, MaterialCategory, MaterialUnit } from '../../domain/models/types';
import { ProfileDrawing } from '../../components/models/ProfileDrawing';
import { MaterialDrawing, materialFacts } from '../../components/models/MaterialDrawing';
import { compareMaterials, cProfileSpec, isTerraceMaterial, materialDimFields, materialShape, matchesSearch, syncNameDims } from '../../domain/models/materialShape';
import { profileGeometry, profileSpecFor, type DimField } from '../../domain/models/profileDrawings';
import { MaterialsImportModal } from '../../components/models/MaterialsImportModal';
import { DrawSectionModal } from '../../components/models/DrawSectionModal';
import { drawnName } from '../../domain/models/drawnSection';
import { materialsToRows, parseCsv } from '../../domain/pricing/materialsIo';
import { loadPdfJs, readPdfTable } from '../../services/pdfTable';
import { readXlsx } from '../../services/xlsx';
import { downloadCsv } from '../../services/exports';
import { downloadMaterialsPdf } from '../../services/pdf';
import { useAppStore } from '../../store/useAppStore';
import { FEATURES, visibleMaterials } from '../../config/features';
import { uid } from '../../utils/id';
import { fmtMoney, fromCurrency, toCurrency } from '../../utils/units';

const CATS: Record<MaterialCategory, string> = { profil: 'Profili', stub: 'Stubovi', okov: 'Okovi', automatika: 'Automatika', staklo: 'Staklo', panel: 'Paneli', ostalo: 'Ostalo' };
const UNITS: MaterialUnit[] = ['m', 'kom', 'set', 'm2', 'kg'];

export default function MaterialsPage() {
  const allMaterials = useAppStore((s) => s.materials);
  // ograde za terase isključene (config/features.ts): materijali za terase se ne prikazuju u listi i izvozu
  const materials = useMemo(() => visibleMaterials(allMaterials), [allMaterials]);
  const settings = useAppStore((s) => s.settings);
  const { upsertMaterial, removeMaterial } = useAppStore.getState();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<MaterialCategory | 'all'>('all');
  /** namena: dvorišne ograde i kapije ili ograde za terase (materijali za terase se nude samo u crtanju ograda za terase) */
  const [use, setUse] = useState<'all' | 'yard' | 'terrace'>('all');
  const [form, setForm] = useState<Material | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [del, setDel] = useState<Material | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [imp, setImp] = useState<{ name: string; table: string[][] } | null>(null);
  const [ioError, setIoError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  /** prozor za crtanje preseka: „new“ = nov materijal od nacrtanog preseka, „form“ = presek materijala koji se menja */
  const [drawFor, setDrawFor] = useState<'new' | 'form' | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  // meni za izvoz se zatvara klikom van njega
  useEffect(() => {
    if (!exportOpen) return;
    const close = (e: PointerEvent) => { if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [exportOpen]);
  const exportCsv = () => { setExportOpen(false); downloadCsv(materialsToRows(materials), `materijali_${new Date().toISOString().slice(0, 10)}.csv`); };
  const exportPdf = async () => {
    setExportOpen(false);
    setExporting(true);
    setIoError(null);
    try { await downloadMaterialsPdf(materials, settings); } catch (e) { setIoError(`PDF nije napravljen: ${(e as Error).message}`); } finally { setExporting(false); }
  };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setIoError(null);
    try {
      // vrsta fajla se prepoznaje i po sadržaju (početak PDF-a i Excela), da pogrešno imenovan fajl ne bude pročitan kao tekst
      const magic = new TextDecoder('latin1').decode(await file.slice(0, 5).arrayBuffer());
      const isXlsx = /\.xlsx$/i.test(file.name) || magic.startsWith('PK');
      const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf' || magic.startsWith('%PDF');
      if (/\.xls$/i.test(file.name)) { setIoError('Stari Excel format (.xls) nije podržan: sačuvajte dokument kao .xlsx ili CSV.'); return; }
      let table: string[][];
      if (isPdf) {
        setReading(true);
        table = await readPdfTable(await file.arrayBuffer(), await loadPdfJs());
      } else table = isXlsx ? readXlsx(await file.arrayBuffer()) : parseCsv(await file.text());
      setImp({ name: file.name, table });
    } catch (e) { setIoError((e as Error).message || 'Dokument nije mogao da se pročita.'); } finally { setReading(false); }
  };

  const list = useMemo(() => {
    return materials.filter((m) => (cat === 'all' || m.category === cat) && (use === 'all' || (use === 'terrace') === isTerraceMaterial(m)) && matchesSearch(`${m.name} ${m.sku}`, q)).sort(compareMaterials);
  }, [materials, q, cat, use]);

  const openNew = () => { setIsNew(true); setForm({ id: uid('mat'), sku: '', name: '', category: 'ostalo', unit: 'kom', unitPrice: 0, wastePercent: 0, demo: false }); };
  const valid = form && form.name.trim().length > 0 && form.sku.trim().length > 0 && form.unitPrice >= 0;
  /** mere preseka izabranog materijala koje se mogu menjati; izmena A, B i zida menja i mere u nazivu (npr. 60×60×2 → 60×60×1,5) */
  const dimFields = form ? materialDimFields(form) : [];
  const previewSpec = form && !form.drawn ? (profileSpecFor(form) ?? cProfileSpec(form)) : null;
  const setDimValue = (f: DimField, v: number | null) => {
    if (!form) return;
    const next: Material = { ...form };
    if (v === null || !(v > 0)) {
      // prazno polje = vrednost iz cenovnika / naziva
      if (f.wall) next.wallMm = undefined; else { const d = { ...(next.dims ?? {}) }; delete d[f.key]; next.dims = Object.keys(d).length ? d : undefined; }
    } else if (f.wall) next.wallMm = v;
    else next.dims = { ...(next.dims ?? {}), [f.key]: v };
    next.name = syncNameDims(form.name, dimFields, materialDimFields(next));
    setForm(next);
  };
  const hasDimEdits = !!form && (form.wallMm !== undefined || (form.dims && Object.keys(form.dims).length > 0));

  return (
    <Page>
      <PageHeader title="Materijali i cene" subtitle="Cenovnik koji koriste kalkulacija i crtanje modela. Materijali se uvoze iz cenovnika dobavljača ili dodaju ručno."  actions={
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".pdf,.xlsx,.csv,.tsv,.txt,application/pdf,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" data-testid="import-file" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
          <button className="btn" data-testid="btn-import-materials" disabled={reading} onClick={() => fileRef.current?.click()}><Upload size={17} />{reading ? 'Čitanje PDF-a…' : 'Uvezi materijale'}</button>
          <div className="relative" ref={exportRef}>
            <button className="btn" data-testid="btn-export-materials" aria-expanded={exportOpen} disabled={exporting} onClick={() => setExportOpen((o) => !o)}><Download size={17} />{exporting ? 'Pravljenje PDF-a…' : 'Izvezi materijale'}<ChevronDown size={15} /></button>
            {exportOpen && (
              <div className="absolute right-0 top-full mt-1 w-60 card p-1.5 z-30" role="menu" data-testid="export-menu">
                <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-50 text-left text-sm" role="menuitem" data-testid="export-pdf" onClick={() => void exportPdf()}><FileText size={17} className="text-primary" /><span><b className="block">PDF dokument</b><span className="text-xs text-muted">tabela za štampu i slanje</span></span></button>
                <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-50 text-left text-sm" role="menuitem" data-testid="export-csv" onClick={exportCsv}><FileSpreadsheet size={17} className="text-primary" /><span><b className="block">Excel / CSV tabela</b><span className="text-xs text-muted">za izmenu i ponovni uvoz</span></span></button>
              </div>
            )}
          </div>
          <button className="btn" data-testid="btn-draw-element" title="Nacrtajte presek profila (U, C, L, cev …); nacrtan presek dobija 2D i 3D prikaz" onClick={() => setDrawFor('new')}><PenTool size={17} />Nacrtaj element</button>
          <button className="btn btn-primary" data-testid="btn-add-material" onClick={openNew}><Plus size={17} />Dodaj materijal</button>
        </div>} />
      {ioError && <p className="text-sm text-[#b42318] mb-2" role="alert">{ioError}</p>}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[220px] max-w-[380px]"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input !pl-10" placeholder="Pretraga po nazivu ili šifri" aria-label="Pretraga materijala" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className="input !w-auto" aria-label="Kategorija" value={cat} onChange={(e) => setCat(e.target.value as MaterialCategory | 'all')}><option value="all">Sve kategorije</option>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          {FEATURES.terraceFences && <select className="input !w-auto" aria-label="Namena" data-testid="materials-use" value={use} onChange={(e) => setUse(e.target.value as 'all' | 'yard' | 'terrace')}>
            <option value="all">Sve namene</option>
            <option value="yard">Dvorišne ograde i kapije</option>
            <option value="terrace">Ograde za terase</option>
          </select>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]" data-testid="materials-table">
            <thead><tr><th className="th">Šifra</th><th className="th">Naziv</th><th className="th">Kategorija</th><th className="th">Jedinica</th><th className="th text-right w-[150px]">Cena ({settings.currency}, neto)</th><th className="th text-right w-[90px]">Otpad %</th><th className="th w-24" /></tr></thead>
            <tbody>
              {list.map((m) => {
                const spec = m.drawn ? null : (profileSpecFor(m) ?? cProfileSpec(m));
                // svaki materijal ima crtež: detaljan sa kotama dobavljača (ako ga ima), inače oblik iz crtanja modela
                const open = openId === m.id;
                const toggle = (e: React.SyntheticEvent) => { if (!(e.target as Element).closest('input,select,button,a')) setOpenId(open ? null : m.id); };
                return (
                <Fragment key={m.id}>
                <tr data-testid="material-row" data-has-drawing={spec ? 'true' : undefined} aria-expanded={open} tabIndex={0}
                  className={`cursor-pointer hover:bg-slate-50 ${open ? 'bg-primary-50' : ''}`}
                  onClick={toggle} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); toggle(e); } }}>
                  <td className="td text-xs text-muted">{m.sku}</td>
                  <td className="td font-medium">{m.name}{m.drawn && <span className="ml-2 text-[11px] font-semibold text-slate-500 align-middle" data-testid="material-drawn-badge">nacrtan presek</span>}<span className="ml-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary align-middle" title="Kliknite na red da vidite crtež i karakteristike"><Ruler size={13} />crtež</span>{FEATURES.terraceFences && isTerraceMaterial(m) && <span className="ml-2 pill !text-[11px] bg-[#eff8ff] text-[#175cd3] align-middle" data-testid="material-terrace-badge">terasa</span>}{m.demo &&<span className="ml-2"><DemoBadge>demo</DemoBadge></span>}</td>
                  <td className="td text-slate-600">{CATS[m.category]}</td>
                  <td className="td"><select aria-label={`Jedinica: ${m.name}`} className="input !w-20 !py-1" value={m.unit} onChange={(e) => upsertMaterial({ ...m, unit: e.target.value as MaterialUnit })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></td>
                  <td className="td"><PriceInput label={`Cena: ${m.name}`} className="!py-1" rsd={m.unitPrice} onChange={(v) => upsertMaterial({ ...m, unitPrice: v })} /></td>
                  <td className="td"><input aria-label={`Otpad: ${m.name}`} type="number" min={0} max={100} className="input !py-1 text-right tabular-nums" value={m.wastePercent} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0 && v <= 100) upsertMaterial({ ...m, wastePercent: v }); }} /></td>
                  <td className="td text-right whitespace-nowrap"><button className="btn btn-sm" title="Izmena materijala: naziv, šifra, kategorija i sve mere preseka (cena, jedinica i otpad se menjaju i direktno u tabeli)" data-testid="material-edit" onClick={() => { setIsNew(false); setForm(m); }}>Izmeni</button> <button className="btn btn-sm btn-icon btn-danger" aria-label={`Obriši ${m.name}`} onClick={() => setDel(m)}><Trash2 size={14} /></button></td>
                </tr>
                {open && (
                  <tr data-testid="material-drawing-row">
                    <td className="td !border-t-0 bg-slate-50" colSpan={7}>
                      <div className="flex flex-wrap gap-6 items-start py-1">
                        {spec ? <ProfileDrawing spec={spec} title={m.name} /> : <MaterialDrawing shape={materialShape(m)} />}
                        <div className="min-w-[220px]">
                          <div className="font-semibold mb-0.5">{m.name}</div>
                          <div className="font-semibold mb-1 text-muted text-[13px]">{m.sku}</div>
                          <div className="text-sm text-slate-600 mb-2">{spec ? 'Poprečni presek profila (mere u mm)' : materialShape(m).type === 'linear' ? 'Poprečni presek profila (mere u mm)' : materialShape(m).type === 'sheet' ? 'Ploča' : 'Izgled dela spreda'}</div>
                          <table className="text-sm"><tbody>{(spec ? profileGeometry(spec).facts : materialFacts(m)).map((f) => <tr key={f.label}><td className="pr-4 py-0.5 text-muted">{f.label}</td><td className="py-0.5 font-medium tabular-nums">{f.value}</td></tr>)}</tbody></table>
                          {spec && profileGeometry(spec).note && <p className="text-[12px] text-muted mt-2 max-w-[300px]" data-testid="drawing-note">{profileGeometry(spec).note}</p>}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
              {list.length === 0 && <tr><td className="td text-muted" colSpan={7}>{materials.length === 0 ? 'Lista materijala je prazna. Uvezite cenovnik dobavljača (dugme „Uvezi materijale“) ili dodajte materijal ručno.' : 'Nema materijala koji odgovaraju pretrazi.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted mt-3">Cena je neto jedinična cena u {fmtMoney(0, settings.currency).replace('0 ', '')}. Ako su cene unete kao bruto, uključite to u kalkulaciji — PDV se neće duplirati. Marža, popust i PDV podešavaju se po projektu (kalkulacija) i kao podrazumevane vrednosti u Podešavanjima.</p>
      </div>
      {imp && <MaterialsImportModal fileName={imp.name} table={imp.table} onClose={() => setImp(null)} />}
      {drawFor && (
        <DrawSectionModal initial={drawFor === 'form' ? form?.drawn : undefined} onClose={() => setDrawFor(null)}
          onSave={(d) => {
            if (drawFor === 'form' && form) setForm({ ...form, drawn: d, wallMm: undefined, dims: undefined, unit: form.unit === 'kom' ? 'm' : form.unit });
            else { setIsNew(true); setForm({ id: uid('mat'), sku: `NAC-${Date.now().toString(36).slice(-5).toUpperCase()}`, name: drawnName(d), category: 'profil', unit: 'm', unitPrice: 0, wastePercent: 0, demo: false, drawn: d }); }
            setDrawFor(null);
          }} />
      )}
      {form && !drawFor && (
        <Modal title={isNew ? 'Novi materijal' : 'Izmena materijala'} width={780} onClose={() => setForm(null)} footer={<><button className="btn" onClick={() => setForm(null)}>Otkaži</button><button className="btn btn-primary" disabled={!valid} data-testid="material-save" onClick={() => { upsertMaterial({ ...form, demo: isNew ? false : form.demo }); setForm(null); }}>Sačuvaj</button></>}>
          <div className="grid gap-x-5 md:grid-cols-[minmax(0,1fr)_260px]">
          <div>
          <TextField label="Šifra" testId="material-sku" value={form.sku} onChange={(v) => setForm({ ...form, sku: v })} />
          <TextField label="Naziv" testId="material-name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <SelectField label="Kategorija" value={form.category} options={Object.entries(CATS).map(([value, label]) => ({ value: value as MaterialCategory, label }))} onChange={(v) => setForm({ ...form, category: v })} />
          <SelectField label="Jedinica mere" value={form.unit} options={UNITS.map((u) => ({ value: u, label: u }))} onChange={(v) => setForm({ ...form, unit: v })} />
          {FEATURES.terraceFences && <label className="flex items-start gap-2 text-[13px] py-1.5" title="Materijal za ograde za terase nudi se samo u crtanju ograda za terase, a ne u crtanju dvorišnih ograda i kapija">
            <input type="checkbox" className="mt-0.5" data-testid="material-terrace" checked={isTerraceMaterial(form)} onChange={(e) => setForm({ ...form, terrace: e.target.checked })} />
            <span><b>Materijal za ograde za terase</b><span className="block text-xs text-muted">Nudi se samo u crtanju ograda za terase (stubovi, rukohvati, prečke, staklo, okov).</span></span>
          </label>}
          <div className="rounded-lg border border-line p-2.5 my-1.5 flex flex-wrap items-center gap-2" data-testid="material-drawn">
            <span className="text-[13px] flex-1 min-w-[180px]">{form.drawn ? <><b>Nacrtan presek</b> — koristi se u crtanju modela, 3D prikazu i krojnoj listi.</> : 'Presek se određuje po šifri i nazivu. Možete ga i nacrtati.'}</span>
            <button className="btn btn-sm" data-testid="material-draw" onClick={() => setDrawFor('form')}><PenTool size={14} />{form.drawn ? 'Izmeni crtež' : 'Nacrtaj presek'}</button>
            {form.drawn && <button className="btn btn-sm" data-testid="material-draw-remove" onClick={() => setForm({ ...form, drawn: undefined, wallMm: undefined })}>Ukloni crtež</button>}
          </div>
          <NumberField label="Cena po jedinici" unit={settings.currency} value={toCurrency(form.unitPrice, settings.currency, settings.currencyRateToEur)} range={{ min: 0, max: 10_000_000 }} allowZero integer={false} step={settings.currency === 'EUR' ? 0.1 : 10} onCommit={(v) => setForm({ ...form, unitPrice: fromCurrency(v, settings.currency, settings.currencyRateToEur) })} />
          {dimFields.length > 0 && (
            <div className="rounded-lg border border-line p-2.5 my-1.5" data-testid="material-dims">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[13px] font-semibold flex-1">Mere preseka (mm)</span>
                {hasDimEdits && <button className="btn btn-sm" data-testid="material-dims-reset" onClick={() => { const next = { ...form, wallMm: undefined, dims: undefined } as Material; next.name = syncNameDims(form.name, dimFields, materialDimFields(next)); setForm(next); }}>Vrati mere iz cenovnika</button>}
              </div>
              {dimFields.map((f) => (
                <div key={f.key} className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-2 py-0.5">
                  <label className="text-[13px] text-slate-700">{f.label}</label>
                  <NumInput testId={`material-dim-${f.key}`} ariaLabel={f.label} value={Math.round(f.value * 100) / 100} onCommit={(v) => setDimValue(f, v)} />
                </div>
              ))}
              <p className="text-xs text-muted leading-snug mt-1">Svaka mera se može promeniti; crtež desno se odmah menja. Izmena A, B i zida menja i mere u nazivu. Prazno polje vraća meru iz cenovnika.</p>
            </div>
          )}
          <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.45fr)] items-center gap-x-3 gap-y-1 py-1.5">
            <label className="label">Masa (kg/m)</label>
            <NumInput testId="material-kgm" ariaLabel="Masa po metru" value={form.kgPerM} placeholder="nije poznato" className="!text-left" onCommit={(v) => setForm({ ...form, kgPerM: v !== null && v > 0 ? v : undefined })} />
            <div className="col-span-2 text-xs text-muted leading-snug">Iz deklaracije profila. Koristi se za procenu mase kapije (pokretni sklop). Prazno = masa nepoznata.</div>
          </div>
          <NumberField label="Procenat otpada" unit="%" value={form.wastePercent} range={{ min: 0, max: 100 }} allowZero integer={false} step={1} onCommit={(v) => setForm({ ...form, wastePercent: v })} />
          </div>
          <div className="hidden md:block" data-testid="material-preview">
            <div className="rounded-xl border border-line bg-white p-2 sticky top-0">
              {previewSpec ? <ProfileDrawing spec={previewSpec} title={form.name} /> : <MaterialDrawing shape={materialShape(form)} />}
              <p className="text-[11.5px] text-muted mt-1">Pregled preseka sa izmenjenim merama.</p>
            </div>
          </div>
          </div>
        </Modal>
      )}
      {del && <ConfirmDialog title="Brisanje materijala" danger confirmLabel="Obriši" message={<>Obrisati <b>{del.name}</b>? Projekti koji ga koriste prikazaće upozorenje „nepoznat materijal" u obračunu.</>} onCancel={() => setDel(null)} onConfirm={() => { removeMaterial(del.id); setDel(null); }} />}
    </Page>
  );
}
