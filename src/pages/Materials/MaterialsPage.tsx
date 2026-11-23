import { ChevronDown, Copy, Download, ImageUp, PenTool, Ruler, FileSpreadsheet, FileText, Plus, Search, Trash2, Upload } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { NumberField, PriceInput, SelectField, TextField } from '../../components/forms/Fields';
import { NumInput } from '../../components/forms/NumInput';
import { DemoBadge, Page, PageHeader } from '../../components/ui/Common';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import type { Material, MaterialCategory, MaterialMassUnit, MaterialUnit } from '../../domain/models/types';
import { defaultMassUnit, excludesMaterialMass, formatMaterialMass, withMaterialMass } from '../../domain/models/materialMass';
import { MATERIAL_UNIT_LABELS, materialPriceInUnit, materialPriceToBase, materialPriceUnits, priceUsesEstimatedMass, selectedPriceUnit, selectMaterialPriceUnit, withMaterialUnits } from '../../domain/models/materialUnits';
import { ProfileDrawing } from '../../components/models/ProfileDrawing';
import { MaterialDrawing, materialFacts } from '../../components/models/MaterialDrawing';
import { compareMaterials, cProfileSpec, isTerraceMaterial, materialDimFields, materialShape, matchesSearch, syncNameDims } from '../../domain/models/materialShape';
import { profileGeometry, profileSpecFor, type DimField } from '../../domain/models/profileDrawings';
import { MaterialsImportModal } from '../../components/models/MaterialsImportModal';
import { DrawSectionModal } from '../../components/models/DrawSectionModal';
import { TraceSectionModal } from '../../components/models/TraceSectionModal';
import { drawnName, drawnSize } from '../../domain/models/drawnSection';
import { materialsToRows, parseCsv } from '../../domain/pricing/materialsIo';
import { loadPdfJs, readPdfTable } from '../../services/pdfTable';
import { readXlsx } from '../../services/xlsx';
import { downloadCsv } from '../../services/exports';
import { downloadMaterialsPdf } from '../../services/pdf';
import { useAppStore } from '../../store/useAppStore';
import { FEATURES, visibleMaterials } from '../../config/features';
import { collectMaterialUsage } from '../../domain/models/materialUsage';
import { uid } from '../../utils/id';
import { fmtMoney, fromCurrency, toCurrency } from '../../utils/units';

const CATS: Record<MaterialCategory, string> = { profil: 'Profili', stub: 'Stubovi', zavrsetak: 'Kape i završeci', montaza: 'Stope i spojni elementi', okov: 'Okovi', automatika: 'Automatika', staklo: 'Staklo', panel: 'Paneli', ostalo: 'Ostalo' };

export default function MaterialsPage() {
  const allMaterials = useAppStore((s) => s.materials);
  const materials = useMemo(() => visibleMaterials(allMaterials), [allMaterials]);
  const settings = useAppStore((s) => s.settings);
  const projects = useAppStore((s) => s.projects);
  const usage = useMemo(() => collectMaterialUsage(allMaterials, settings, projects), [allMaterials, settings, projects]);
  const [usageFilter, setUsageFilter] = useState<'used' | 'unused' | 'all'>('used');
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
  const [traceFor, setTraceFor] = useState<'new' | 'form' | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  // meni za izvoz se zatvara klikom van njega
  useEffect(() => {
    if (!exportOpen) return;
    const close = (e: PointerEvent) => { if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [exportOpen]);
  const exportCsv = () => { setExportOpen(false); downloadCsv(materialsToRows(list), `materijali_${new Date().toISOString().slice(0, 10)}.csv`); };
  const exportPdf = async () => {
    setExportOpen(false);
    setExporting(true);
    setIoError(null);
    try { await downloadMaterialsPdf(list, settings); } catch (e) { setIoError(`PDF nije napravljen: ${(e as Error).message}`); } finally { setExporting(false); }
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

  const filteredMaterials = useMemo(() => materials.filter((m) =>
    (cat === 'all' || m.category === cat) &&
    (use === 'all' || (use === 'terrace' ? isTerraceMaterial(m) || usage.terrace.has(m.id) : !isTerraceMaterial(m) || usage.yard.has(m.id))) &&
    matchesSearch(`${m.name} ${m.sku}`, q)), [materials, cat, use, usage, q]);
  const usedIds = use === 'all' ? usage.used : usage[use];
  const usedCount = filteredMaterials.filter((m) => usedIds.has(m.id)).length;
  const list = useMemo(() => filteredMaterials.filter((m) => usageFilter === 'all' || usedIds.has(m.id) === (usageFilter === 'used')).sort(compareMaterials), [filteredMaterials, usedIds, usageFilter]);

  /** kopija materijala: nov ID, jedinstvena šifra i naziv „(kopija)“; mere, presek i cena se prepisuju, pa se menja samo ono što treba */
  const copyMaterial = (m: Material) => {
    const skus = new Set(allMaterials.map((x) => x.sku.toLowerCase()));
    let sku = `${m.sku}-K`; for (let n = 2; skus.has(sku.toLowerCase()); n++) sku = `${m.sku}-K${n}`;
    const clone = JSON.parse(JSON.stringify(m)) as Material;
    setIsNew(true);
    setForm({ ...clone, id: uid('mat'), sku, name: `${m.name} (kopija)`, demo: false, terrace: use === 'terrace' || isTerraceMaterial(clone) });
  };
  const openNew = () => { setIsNew(true); setForm({ id: uid('mat'), sku: '', name: '', category: 'ostalo', unit: 'kom', unitPrice: 0, wastePercent: 0, demo: false, terrace: use === 'terrace' }); };
  // materijal se razlikuje po nazivu (šifra se ne unosi i ne prikazuje)
  const valid = form && form.name.trim().length > 0 && form.unitPrice >= 0;
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
  const formMass = form ? withMaterialMass(form) : null;
  const formPricing = form ? withMaterialUnits(form) : null;

  return (
    <Page>
      <PageHeader title="Materijali i cene" subtitle="Materijali odvojeni prema upotrebi u modelima i projektima. Ostali materijali ostaju dostupni za nove modele."  actions={
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
          <button className="btn" data-testid="btn-trace-element" title="Izaberite sliku preseka profila; aplikacija pravi 2D i 3D prikaz od nje" onClick={() => setTraceFor('new')}><ImageUp size={17} />Presek iz slike</button>
          <button className="btn btn-primary" data-testid="btn-add-material" onClick={openNew}><Plus size={17} />Dodaj materijal</button>
        </div>} />
      {ioError && <p className="text-sm text-[#b42318] mb-2" role="alert">{ioError}</p>}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[220px] max-w-[380px]"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input !pl-10" placeholder="Pretraga po nazivu" aria-label="Pretraga materijala" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className="input !w-auto" aria-label="Kategorija" value={cat} onChange={(e) => setCat(e.target.value as MaterialCategory | 'all')}><option value="all">Sve kategorije</option>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          {FEATURES.terraceFences && <select className="input !w-auto" aria-label="Namena" data-testid="materials-use" value={use} onChange={(e) => setUse(e.target.value as 'all' | 'yard' | 'terrace')}>
            <option value="all">Sve namene</option>
            <option value="yard">Dvorišne ograde i kapije</option>
            <option value="terrace">Ograde za terase</option>
          </select>}
        </div>
        <div className="flex flex-wrap gap-2 mb-2" role="group" aria-label="Upotreba materijala">
          {([['used', 'Koristi se', usedCount], ['unused', 'Ne koristi se', filteredMaterials.length - usedCount], ['all', 'Svi materijali', filteredMaterials.length]] as const).map(([value, label, count]) => (
            <button key={value} className={`btn btn-sm ${usageFilter === value ? 'btn-primary' : ''}`} data-testid={`materials-${value}`} aria-pressed={usageFilter === value} onClick={() => setUsageFilter(value)}>{label} ({count})</button>
          ))}
        </div>
        <p className="text-xs text-muted mb-4">Upotreba se određuje automatski iz modela, uključenih stavki sastavnica, šablona stubova i sačuvanih projekata{use === 'terrace' ? ' za terase' : use === 'yard' ? ' za dvorišne ograde i kapije' : ''}. Izvoz prati trenutni prikaz.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]" data-testid="materials-table">
            <thead><tr><th className="th">Naziv</th><th className="th">Kategorija</th><th className="th">Jedinica</th><th className="th text-right whitespace-nowrap">Masa</th><th className="th text-right w-[150px]">Cena ({settings.currency}, neto)</th><th className="th text-right w-[90px]">Otpad %</th><th className="th w-24" /></tr></thead>
            <tbody>
              {list.map((m) => {
                const spec = m.drawn ? null : (profileSpecFor(m) ?? cProfileSpec(m));
                // svaki materijal ima crtež: detaljan sa kotama dobavljača (ako ga ima), inače oblik iz crtanja modela
                const open = openId === m.id;
                const toggle = (e: React.SyntheticEvent) => { if (!(e.target as Element).closest('input,select,button,a')) setOpenId(open ? null : m.id); };
                return (
                <Fragment key={m.id}>
                <tr data-testid="material-row" data-usage={usedIds.has(m.id) ? 'used' : 'unused'} data-has-drawing={spec ? 'true' : undefined} aria-expanded={open} tabIndex={0}
                  className={`cursor-pointer hover:bg-slate-50 ${open ? 'bg-primary-50' : ''}`}
                  onClick={toggle} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); toggle(e); } }}>
                  <td className="td font-medium">{m.name}{m.drawn && <span className="ml-2 text-[11px] font-semibold text-slate-500 align-middle" data-testid="material-drawn-badge">nacrtan presek</span>}<span className="ml-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary align-middle" title="Kliknite na red da vidite crtež i karakteristike"><Ruler size={13} />crtež</span>{FEATURES.terraceFences && isTerraceMaterial(m) && <span className="ml-2 pill !text-[11px] bg-[#eff8ff] text-[#175cd3] align-middle" data-testid="material-terrace-badge">terasa</span>}{m.demo &&<span className="ml-2"><DemoBadge>demo</DemoBadge></span>}</td>
                  <td className="td text-slate-600">{CATS[m.category]}</td>
                  <td className="td"><select aria-label={`Jedinica: ${m.name}`} className="input !w-20 !py-1" value={selectedPriceUnit(m)} disabled={materialPriceUnits(m).length === 1} onChange={(e) => upsertMaterial(selectMaterialPriceUnit(m, e.target.value as MaterialUnit))}>{materialPriceUnits(m).map((u) => <option key={u} value={u}>{MATERIAL_UNIT_LABELS[u]}</option>)}</select>{m.unitCorrection && <span className="block text-[11px] text-amber-700 mt-1" title={`Ispravljena jedinica ${m.unitCorrection.from} → ${m.unitCorrection.to}. Proverite da cena odgovara novoj jedinici.`}>Proveri osnovicu cene</span>}</td>
                  <td className="td text-right tabular-nums whitespace-nowrap" data-testid="material-mass" title={excludesMaterialMass(m) ? 'Izuzeto iz mase aluminijumskog materijala' : m.massReference ?? 'Unesite potvrđenu masu u prozoru Izmeni'}>{formatMaterialMass(m)}</td>
                  <td className="td"><PriceInput label={`Cena: ${m.name}`} className="!py-1" precision={2} rsd={materialPriceInUnit(m)} onChange={(v) => upsertMaterial({ ...m, unitPrice: materialPriceToBase(m, v), unitCorrection: undefined })} />{priceUsesEstimatedMass(m) && <span className="block text-[11px] text-muted mt-1" data-testid="price-estimated">≈ prema procenjenoj masi</span>}</td>
                  <td className="td"><NumInput ariaLabel={`Otpad: ${m.name}`} min={0} max={100} required unit="%" value={m.wastePercent}
                    onCommit={(v) => { if (v !== null) upsertMaterial({ ...m, wastePercent: v }); }} /></td>
                  <td className="td text-right whitespace-nowrap"><button className="btn btn-sm" title="Izmena materijala: naziv, kategorija i sve mere preseka (cena, jedinica i otpad se menjaju i direktno u tabeli)" data-testid="material-edit" onClick={() => { setIsNew(false); setForm(m); }}>Izmeni</button> <button className="btn btn-sm btn-icon" title="Kopiraj materijal: otvara kopiju sa istim merama i presekom, pa promeniš samo ono što treba" aria-label={`Kopiraj ${m.name}`} data-testid="material-copy" onClick={() => copyMaterial(m)}><Copy size={14} /></button> <button className="btn btn-sm btn-icon btn-danger" aria-label={`Obriši ${m.name}`} onClick={() => setDel(m)}><Trash2 size={14} /></button></td>
                </tr>
                {open && (
                  <tr data-testid="material-drawing-row">
                    <td className="td !border-t-0 bg-slate-50" colSpan={7}>
                      <div className="flex flex-wrap gap-6 items-start py-1">
                        {spec ? <ProfileDrawing spec={spec} title={m.name} /> : <MaterialDrawing shape={materialShape(m)} />}
                        <div className="min-w-[220px]">
                          <div className="font-semibold mb-0.5">{m.name}</div>
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
              {list.length === 0 && <tr><td className="td text-muted" colSpan={7}>{materials.length === 0 ? 'Lista materijala je prazna. Uvezite cenovnik dobavljača (dugme „Uvezi materijale“) ili dodajte materijal ručno.' : usageFilter === 'used' ? 'Nema materijala u upotrebi za izabrane filtere. Otvorite „Ne koristi se“ ili „Svi materijali“ za preostali cenovnik.' : 'Nema materijala koji odgovaraju izabranim filterima.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted mt-3" data-testid="material-mass-legend">Masa sa oznakom ≈ je procena. Usvojene mere i gustina prikazuju se u prozoru Izmeni. Kataloška i ručno potvrđena masa imaju prednost.</p>
        <p className="text-xs text-muted mt-2" data-testid="material-price-unit-legend">Promena jedinice preračunava cenu za istu količinu materijala. Nude se samo jedinice povezane poznatom masom, merama komada ili brojem komada u setu. Cena po kg zasnovana na procenjenoj masi takođe je približna.</p>
        <p className="text-xs text-muted mt-3">Cena je neto jedinična cena u {fmtMoney(0, settings.currency).replace('0 ', '')}. Ako su cene unete kao bruto, uključite to u kalkulaciji — PDV se neće duplirati. Marža, popust i PDV podešavaju se po projektu (kalkulacija) i kao podrazumevane vrednosti u Podešavanjima.</p>
      </div>
      {imp && <MaterialsImportModal fileName={imp.name} table={imp.table} onClose={() => setImp(null)} />}
      {drawFor && (
        <DrawSectionModal initial={drawFor === 'form' ? form?.drawn : undefined} onClose={() => setDrawFor(null)}
          onSave={(d) => {
            if (drawFor === 'form' && form) setForm({ ...form, drawn: d, wallMm: undefined, dims: undefined, unit: form.unit === 'kom' ? 'm' : form.unit });
            else { setIsNew(true); setForm({ id: uid('mat'), sku: `NAC-${Date.now().toString(36).slice(-5).toUpperCase()}`, name: drawnName(d), category: 'profil', unit: 'm', unitPrice: 0, wastePercent: 0, demo: false, terrace: use === 'terrace', drawn: d }); }
            setDrawFor(null);
          }} />
      )}
      {traceFor && (
        <TraceSectionModal onClose={() => setTraceFor(null)}
          onSave={(d) => {
            if (traceFor === 'form' && form) setForm({ ...form, drawn: d, wallMm: undefined, dims: undefined, unit: form.unit === 'kom' ? 'm' : form.unit });
            else { setIsNew(true); setForm({ id: uid('mat'), sku: `NAC-${Date.now().toString(36).slice(-5).toUpperCase()}`, name: drawnName(d), category: 'profil', unit: 'm', unitPrice: 0, wastePercent: 0, demo: false, terrace: use === 'terrace', drawn: d }); }
            setTraceFor(null);
          }} />
      )}
      {form && !drawFor && !traceFor && (
        <Modal title={isNew ? 'Novi materijal' : 'Izmena materijala'} width={780} onClose={() => setForm(null)} footer={<><button className="btn" onClick={() => setForm(null)}>Otkaži</button><button className="btn btn-primary" disabled={!valid} data-testid="material-save" onClick={() => { upsertMaterial({ ...formPricing!, unitCorrection: undefined, massReference: form.massSource === 'manual' ? undefined : formPricing!.massReference, demo: isNew ? false : form.demo }); if (isNew && usageFilter === 'used') setUsageFilter('unused'); setForm(null); }}>Sačuvaj</button></>}>
          <div className="grid gap-x-5 md:grid-cols-[minmax(0,1fr)_260px]">
          <div>
          <TextField label="Naziv" testId="material-name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <SelectField label="Kategorija" value={form.category} options={Object.entries(CATS).map(([value, label]) => ({ value: value as MaterialCategory, label }))} onChange={(v) => setForm({ ...form, category: v })} />
          <SelectField label="Jedinica mere" value={selectedPriceUnit(formPricing!)} disabled={materialPriceUnits(formPricing!).length === 1} options={materialPriceUnits(formPricing!).map((u) => ({ value: u, label: MATERIAL_UNIT_LABELS[u] }))} onChange={(v) => setForm(selectMaterialPriceUnit(formPricing!, v))} />
          {FEATURES.terraceFences && <label className="flex items-start gap-2 text-[13px] py-1.5" title="Materijal za ograde za terase nudi se samo u crtanju ograda za terase, a ne u crtanju dvorišnih ograda i kapija">
            <input type="checkbox" className="mt-0.5" data-testid="material-terrace" checked={isTerraceMaterial(form)} onChange={(e) => setForm({ ...form, terrace: e.target.checked })} />
            <span><b>Materijal za ograde za terase</b><span className="block text-xs text-muted">Nudi se samo u crtanju ograda za terase (stubovi, rukohvati, prečke, staklo, okov).</span></span>
          </label>}
          <div className="rounded-lg border border-line p-2.5 my-1.5 flex flex-wrap items-center gap-2" data-testid="material-drawn">
            <span className="text-[13px] flex-1 min-w-[180px]">{form.drawn ? <><b>{form.drawn.polys ? 'Presek iz slike' : 'Nacrtan presek'}</b> — koristi se u crtanju modela, 3D prikazu i krojnoj listi.</> : 'Presek se određuje po nazivu. Možete ga i nacrtati.'}</span>
            {!form.drawn?.polys && <button className="btn btn-sm" data-testid="material-draw" onClick={() => setDrawFor('form')}><PenTool size={14} />{form.drawn ? 'Izmeni crtež' : 'Nacrtaj presek'}</button>}
            <button className="btn btn-sm" data-testid="material-trace" onClick={() => setTraceFor('form')}><ImageUp size={14} />{form.drawn?.polys ? 'Druga slika' : 'Presek iz slike'}</button>
            {form.drawn && <button className="btn btn-sm" data-testid="material-draw-remove" onClick={() => setForm({ ...form, drawn: undefined, wallMm: undefined })}>Ukloni crtež</button>}
          </div>
          {form.drawn?.polys && (() => {
            const size = drawnSize(form.drawn);
            // mere preseka iz slike: razvlače se poligoni po širini i visini (npr. rukohvat 100 → 60 mm)
            const resize = (w: number, h: number) => {
              const d = form.drawn!;
              const sx = w / size.w; const sy = h / size.h;
              const r = (n: number) => Math.round(n * 100) / 100;
              const polys = d.polys!.map((p) => ({ outline: p.outline.map(([x, y]) => [r(x * sx), r(y * sy)] as [number, number]), holes: p.holes.map((hl) => hl.map(([x, y]) => [r(x * sx), r(y * sy)] as [number, number])) }));
              setForm({ ...form, drawn: { ...d, polys, wall: r(d.wall * Math.min(sx, sy)) } });
            };
            return (
              <div className="rounded-lg border border-line p-2.5 my-1.5" data-testid="material-drawn-size">
                <div className="text-[13px] font-semibold mb-1">Mere preseka (mm)</div>
                <NumberField label="Širina" unit="mm" value={size.w} range={{ min: 1, max: 2000 }} integer={false} step={1} onCommit={(v) => resize(v, size.h)} />
                <NumberField label="Visina" unit="mm" value={size.h} range={{ min: 1, max: 2000 }} integer={false} step={1} onCommit={(v) => resize(size.w, v)} />
              </div>
            );
          })()}
          <NumberField label={`Cena po ${MATERIAL_UNIT_LABELS[selectedPriceUnit(formPricing!)]}`} unit={settings.currency} value={Math.round(toCurrency(materialPriceInUnit(formPricing!), settings.currency, settings.currencyRateToEur) * 100) / 100} range={{ min: 0, max: 10_000_000 }} allowZero integer={false} step={settings.currency === 'EUR' ? 0.1 : 10} onCommit={(v) => setForm({ ...formPricing!, unitPrice: materialPriceToBase(formPricing!, fromCurrency(v, settings.currency, settings.currencyRateToEur)), unitCorrection: undefined })} />
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
          {excludesMaterialMass(form) ? <p className="text-xs text-muted py-2" data-testid="material-mass-excluded">Masa: — (izuzeto iz mase aluminijumskog materijala).</p> : <div className="rounded-lg border border-line p-2.5 my-1.5">
            <div className="text-[13px] font-semibold mb-1">Masa</div>
            <div className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-2">
              <NumInput testId="material-kgm" ariaLabel="Masa materijala" precision={3} value={formMass?.mass} placeholder="Potreban podatak" className="!text-left" onCommit={(v) => setForm({ ...formMass!, mass: v !== null && v > 0 ? v : undefined, massUnit: formMass?.massUnit ?? defaultMassUnit(form), massSource: 'manual', massBasis: undefined, kgPerM: undefined })} />
              <select className="input !py-1" aria-label="Jedinica mase" value={formMass?.massUnit ?? defaultMassUnit(form)} onChange={(e) => setForm({ ...formMass!, massUnit: e.target.value as MaterialMassUnit, massSource: 'manual', massBasis: undefined, kgPerM: undefined })}>
                {(['kg/m', 'kg/m²', 'kg/kom'] as const).map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
            <p className="text-xs text-muted leading-snug mt-1 min-h-[48px]">{formMass?.massSource === 'estimated' ? 'Približna masa — procena prema dimenzijama, crtežu i usvojenim merama.' : formMass?.massSource === 'calculated' ? 'Nominalna masa iz dimenzija i gustine materijala.' : formMass?.massSource === 'catalog' ? 'Kataloška masa za tačnu šifru profila.' : formMass?.mass ? 'Ručno uneta ili ranije sačuvana potvrđena masa.' : 'Potreban podatak: unesite potvrđenu masu konkretnog artikla.'} Profili i šipke od 6 m: kg/m; puni lim: kg/m²; poznat gotov komad: kg/kom.</p>
            {/* Zadržavamo visinu objašnjenja tokom ručnog unosa da dugme Sačuvaj ne promeni položaj između mouse-down i click događaja. */}
            {formMass?.massReference && <p className={`text-xs text-muted leading-snug mt-1 ${formMass.massSource === 'manual' ? 'invisible' : ''}`} data-testid="material-mass-assumptions">{formMass.massReference.replace(/https?:\/\/[^\s)]+/g, '').replace(/\(\)/g, '')}</p>}
          </div>}
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
