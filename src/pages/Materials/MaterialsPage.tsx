import { ChevronDown, Download, Ruler, FileSpreadsheet, FileText, Plus, Search, Trash2, Upload } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { NumberField, SelectField, TextField } from '../../components/forms/Fields';
import { DemoBadge, Page, PageHeader } from '../../components/ui/Common';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import type { Material, MaterialCategory, MaterialUnit } from '../../domain/models/types';
import { ProfileDrawing } from '../../components/models/ProfileDrawing';
import { profileGeometry, profileSpecFor } from '../../domain/models/profileDrawings';
import { MaterialsImportModal } from '../../components/models/MaterialsImportModal';
import { materialsToRows, parseCsv } from '../../domain/pricing/materialsIo';
import { loadPdfJs, readPdfTable } from '../../services/pdfTable';
import { readXlsx } from '../../services/xlsx';
import { downloadCsv } from '../../services/exports';
import { downloadMaterialsPdf } from '../../services/pdf';
import { useAppStore } from '../../store/useAppStore';
import { uid } from '../../utils/id';
import { fmtMoney } from '../../utils/units';

const CATS: Record<MaterialCategory, string> = { profil: 'Profili', stub: 'Stubovi', okov: 'Okovi', automatika: 'Automatika', staklo: 'Staklo', panel: 'Paneli', ostalo: 'Ostalo' };
const UNITS: MaterialUnit[] = ['m', 'kom', 'set', 'm2', 'kg'];

export default function MaterialsPage() {
  const materials = useAppStore((s) => s.materials);
  const settings = useAppStore((s) => s.settings);
  const { upsertMaterial, removeMaterial } = useAppStore.getState();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<MaterialCategory | 'all'>('all');
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
    const t = q.trim().toLowerCase();
    return materials.filter((m) => (cat === 'all' || m.category === cat) && (!t || m.name.toLowerCase().includes(t) || m.sku.toLowerCase().includes(t)));
  }, [materials, q, cat]);

  const openNew = () => { setIsNew(true); setForm({ id: uid('mat'), sku: '', name: '', category: 'ostalo', unit: 'kom', unitPrice: 0, wastePercent: 0, demo: false }); };
  const valid = form && form.name.trim().length > 0 && form.sku.trim().length > 0 && form.unitPrice >= 0;

  return (
    <Page>
      <PageHeader title="Materijali i cene" subtitle={<>Cenovnik koji koristi kalkulacija. <DemoBadge>Ilustrativni iznosi — nisu stvarne cene</DemoBadge></>} actions={
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
          <button className="btn btn-primary" data-testid="btn-add-material" onClick={openNew}><Plus size={17} />Dodaj materijal</button>
        </div>} />
      {ioError && <p className="text-sm text-[#b42318] mb-2" role="alert">{ioError}</p>}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[220px] max-w-[380px]"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input !pl-10" placeholder="Pretraga po nazivu ili šifri" aria-label="Pretraga materijala" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className="input !w-auto" aria-label="Kategorija" value={cat} onChange={(e) => setCat(e.target.value as MaterialCategory | 'all')}><option value="all">Sve kategorije</option>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]" data-testid="materials-table">
            <thead><tr><th className="th">Šifra</th><th className="th">Naziv</th><th className="th">Kategorija</th><th className="th">Jedinica</th><th className="th text-right w-[150px]">Cena ({settings.currency}, neto)</th><th className="th text-right w-[90px]">Otpad %</th><th className="th w-24" /></tr></thead>
            <tbody>
              {list.map((m) => {
                const spec = profileSpecFor(m);
                const open = openId === m.id && !!spec;
                const toggle = (e: React.SyntheticEvent) => { if (spec && !(e.target as Element).closest('input,select,button,a')) setOpenId(open ? null : m.id); };
                return (
                <Fragment key={m.id}>
                <tr data-testid="material-row" data-has-drawing={spec ? 'true' : undefined} aria-expanded={spec ? open : undefined} tabIndex={spec ? 0 : undefined}
                  className={spec ? `cursor-pointer hover:bg-slate-50 ${open ? 'bg-primary-50' : ''}` : undefined}
                  onClick={toggle} onKeyDown={(e) => { if (spec && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); toggle(e); } }}>
                  <td className="td text-xs text-muted">{m.sku}</td>
                  <td className="td font-medium">{m.name}{spec && <span className="ml-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary align-middle" title="Ima crtež — kliknite na red"><Ruler size={13} />crtež</span>}{m.demo && <span className="ml-2"><DemoBadge>demo</DemoBadge></span>}</td>
                  <td className="td text-slate-600">{CATS[m.category]}</td>
                  <td className="td"><select aria-label={`Jedinica: ${m.name}`} className="input !w-20 !py-1" value={m.unit} onChange={(e) => upsertMaterial({ ...m, unit: e.target.value as MaterialUnit })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></td>
                  <td className="td"><input aria-label={`Cena: ${m.name}`} type="number" min={0} className="input !py-1 text-right tabular-nums" value={m.unitPrice} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) upsertMaterial({ ...m, unitPrice: v }); }} /></td>
                  <td className="td"><input aria-label={`Otpad: ${m.name}`} type="number" min={0} max={100} className="input !py-1 text-right tabular-nums" value={m.wastePercent} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0 && v <= 100) upsertMaterial({ ...m, wastePercent: v }); }} /></td>
                  <td className="td text-right whitespace-nowrap"><button className="btn btn-sm" onClick={() => { setIsNew(false); setForm(m); }}>Izmeni</button> <button className="btn btn-sm btn-icon btn-danger" aria-label={`Obriši ${m.name}`} onClick={() => setDel(m)}><Trash2 size={14} /></button></td>
                </tr>
                {open && spec && (
                  <tr data-testid="material-drawing-row">
                    <td className="td !border-t-0 bg-slate-50" colSpan={7}>
                      <div className="flex flex-wrap gap-6 items-start py-1">
                        <ProfileDrawing spec={spec} title={m.name} />
                        <div className="min-w-[220px]">
                          <div className="font-semibold mb-1">{m.sku}</div>
                          <div className="text-sm text-slate-600 mb-2">Poprečni presek profila (mere u mm)</div>
                          <table className="text-sm"><tbody>{profileGeometry(spec).facts.map((f) => <tr key={f.label}><td className="pr-4 py-0.5 text-muted">{f.label}</td><td className="py-0.5 font-medium tabular-nums">{f.value}</td></tr>)}</tbody></table>
                          {profileGeometry(spec).note && <p className="text-[12px] text-muted mt-2 max-w-[300px]" data-testid="drawing-note">{profileGeometry(spec).note}</p>}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
              {list.length === 0 && <tr><td className="td text-muted" colSpan={7}>Nema materijala koji odgovaraju pretrazi.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted mt-3">Cena je neto jedinična cena u {fmtMoney(0, settings.currency).replace('0 ', '')}. Ako su cene unete kao bruto, uključite to u kalkulaciji — PDV se neće duplirati. Marža, popust i PDV podešavaju se po projektu (kalkulacija) i kao podrazumevane vrednosti u Podešavanjima.</p>
      </div>
      {imp && <MaterialsImportModal fileName={imp.name} table={imp.table} onClose={() => setImp(null)} />}
      {form && (
        <Modal title={isNew ? 'Novi materijal' : 'Izmena materijala'} onClose={() => setForm(null)} footer={<><button className="btn" onClick={() => setForm(null)}>Otkaži</button><button className="btn btn-primary" disabled={!valid} data-testid="material-save" onClick={() => { upsertMaterial({ ...form, demo: isNew ? false : form.demo }); setForm(null); }}>Sačuvaj</button></>}>
          <TextField label="Šifra" testId="material-sku" value={form.sku} onChange={(v) => setForm({ ...form, sku: v })} />
          <TextField label="Naziv" testId="material-name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <SelectField label="Kategorija" value={form.category} options={Object.entries(CATS).map(([value, label]) => ({ value: value as MaterialCategory, label }))} onChange={(v) => setForm({ ...form, category: v })} />
          <SelectField label="Jedinica mere" value={form.unit} options={UNITS.map((u) => ({ value: u, label: u }))} onChange={(v) => setForm({ ...form, unit: v })} />
          <NumberField label="Cena po jedinici" unit={settings.currency} value={form.unitPrice} range={{ min: 0, max: 10_000_000 }} allowZero integer={false} step={10} onCommit={(v) => setForm({ ...form, unitPrice: v })} />
          <NumberField label="Procenat otpada" unit="%" value={form.wastePercent} range={{ min: 0, max: 100 }} allowZero integer={false} step={1} onCommit={(v) => setForm({ ...form, wastePercent: v })} />
        </Modal>
      )}
      {del && <ConfirmDialog title="Brisanje materijala" danger confirmLabel="Obriši" message={<>Obrisati <b>{del.name}</b>? Projekti koji ga koriste prikazaće upozorenje „nepoznat materijal" u obračunu.</>} onCancel={() => setDel(null)} onConfirm={() => { removeMaterial(del.id); setDel(null); }} />}
    </Page>
  );
}
