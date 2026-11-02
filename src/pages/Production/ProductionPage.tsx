import { FileDown, FileSpreadsheet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FrontView } from '../../components/editor/FrontView';
import { NumberField, SelectField, TextField, ToggleField } from '../../components/forms/Fields';
import { EmptyState, Page, PageHeader } from '../../components/ui/Common';
import { STATUS_LABELS } from '../../domain/models/catalog';
import { computeLayout } from '../../domain/geometry/layout';
import type { ProjectStatus } from '../../domain/models/types';
import { buildBom } from '../../domain/pricing/calc';
import { buildCutList, buildHardwareList, describeItem } from '../../domain/pricing/production';
import { buildLouver08Sheet, FILL_PROFILES, GUIDE_PROFILES } from '../../domain/pricing/louverSpec';
import { buildRail04Sheet } from '../../domain/pricing/railSpec';
import { downloadCsv, safeFilename } from '../../services/exports';
import { downloadProductionPdf } from '../../services/pdf';
import { useAppStore } from '../../store/useAppStore';
import { itemLabel } from '../../utils/labels';
import { fmtNum } from '../../utils/units';

export default function ProductionPage() {
  const projects = useAppStore((s) => s.projects);
  const customers = useAppStore((s) => s.customers);
  const materials = useAppStore((s) => s.materials);
  const specs = useAppStore((s) => s.settings.modelSpecs);
  const settings = useAppStore((s) => s.settings);
  const patchProject = useAppStore((s) => s.patchProject);
  const [id, setId] = useState<string>(projects.find((p) => p.status === 'u_izradi')?.id ?? projects[0]?.id ?? '');
  const project = projects.find((p) => p.id === id) ?? projects[0];
  const customer = customers.find((c) => c.id === project?.customerId) ?? null;
  const cuts = useMemo(() => (project ? buildCutList(project, specs, materials) : []), [project, specs, materials]);
  const hw = useMemo(() => (project ? buildHardwareList(project) : []), [project]);
  const rail = useMemo(() => (project ? buildRail04Sheet(project, specs) : null), [project, specs]);
  const louver = useMemo(() => (project ? buildLouver08Sheet(project, specs) : null), [project, specs]);
  const [busy, setBusy] = useState(false);

  if (!project) return <Page><PageHeader title="Proizvodnja" /><EmptyState title="Nema projekata" text="Napravite projekat da biste dobili proizvodnu specifikaciju." /></Page>;
  const layout = computeLayout(project);

  const csv = () => {
    const bom = buildBom(project, materials, specs);
    downloadCsv([
      ['Grupa', 'Šifra', 'Naziv', 'Jedinica', 'Geometrijska količina', 'Nabavna količina', 'Cena/JM (neto)', 'Ukupno'],
      ...bom.map((l) => [l.group, l.sku, l.name, l.unit, l.geometricQty.toFixed(3), l.purchaseQty.toFixed(3), l.unitPriceNet.toFixed(2), l.total.toFixed(2)]),
    ], `materijal_${safeFilename(project.name)}.csv`);
  };

  const railCsv = () => {
    if (!rail) return;
    downloadCsv([
      ['Sastavnica — model 04'], ['Poz.', 'Deo', 'Kataloška oznaka', 'Količina', 'Napomena'],
      ...rail.bom.map((r) => [String(r.pos), r.part, r.code, r.qty, r.note]),
      [], ['Krojna lista — model 04 (mm)'], ['Oznaka', 'Deo', 'Profil', 'Komada', 'Dužina komada', 'Ukupna dužina', 'Rez'],
      ...rail.cuts.map((c) => [c.mark, c.part, c.profile, String(c.qty), String(c.lengthMm), String(c.totalMm), c.cut]),
      [], ['Raspored na šipke'], ['Profil', 'Komadi (mm)', 'Utrošak na rezove (mm)', 'Ostatak šipke (mm)'],
      ...rail.bars.map((b) => [b.profile, b.pieces, String(b.cutsMm), String(b.leftoverMm)]),
    ], `model04_${safeFilename(project.name)}.csv`);
  };

  const louverCsv = () => {
    if (!louver) return;
    downloadCsv([
      ['Sastavnica — model 08 (radno, čeka potvrdu)'], ['Poz.', 'Deo', 'Oznaka', 'Količina', 'Napomena'],
      ...louver.bom.map((r) => [String(r.pos), r.part, r.code, r.qty, r.note]),
      [], ['Krojna lista — model 08 (mm)'], ['Oznaka', 'Deo', 'Profil', 'Komada', 'Dužina komada', 'Ukupna dužina'],
      ...louver.cuts.map((c) => [c.mark, c.part, c.profile, String(c.qty), String(c.lengthMm), String(c.totalMm)]),
      [], ['Raspored na šipke'], ['Profil', 'Komadi (mm)', 'Ostatak šipke (mm)'],
      ...louver.bars.map((b) => [b.profile, b.pieces, String(b.leftoverMm)]),
    ], `model08_${safeFilename(project.name)}.csv`);
  };
  const setSpec = (patch: Partial<NonNullable<typeof project.louverSpec>>) => patchProject(project.id, { louverSpec: { ...project.louverSpec, ...patch } });

  return (
    <Page>
      <PageHeader title="Proizvodnja" subtitle="Osnovna proizvodna specifikacija za izabrani projekat" actions={
        <>
          <button className="btn" data-testid="prod-csv" onClick={csv}><FileSpreadsheet size={17} />CSV lista materijala</button>
          <button className="btn btn-primary" data-testid="prod-pdf" disabled={busy} onClick={async () => { setBusy(true); try { await downloadProductionPdf(project, customer, settings); } finally { setBusy(false); } }}><FileDown size={17} />PDF specifikacija</button>
        </>
      } />
      <div role="note" className="rounded-lg bg-[#fffaeb] text-[#93370d] border border-[#fedf89] px-4 py-2.5 text-[13px] mb-4">
        <b>Okvirna geometrijska specifikacija.</b> Nije finalna proizvodna dokumentacija i ne sadrži optimizaciju sečenja. Stvarne mere zavise od sistema profila i procedura proizvođača.
      </div>
      <div className="card p-4 mb-5 grid gap-x-6 sm:grid-cols-3">
        <SelectField label="Projekat" value={project.id} options={projects.map((p) => ({ value: p.id, label: p.name }))} onChange={setId} />
        <SelectField label="Status" testId="prod-status" value={project.status} options={(Object.keys(STATUS_LABELS) as ProjectStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] }))} onChange={(v) => patchProject(project.id, { status: v })} />
        <div className="py-1.5 text-sm"><span className="label">Kupac:</span> {customer?.name ?? '—'}</div>
      </div>
      <div className="card p-4 mb-5 overflow-auto"><FrontView project={project} scale={0.07} /></div>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card p-4 overflow-x-auto">
          <h2 className="font-bold mb-2">Redosled elemenata</h2>
          <table className="w-full min-w-[480px]"><thead><tr><th className="th">#</th><th className="th">Element</th><th className="th">Model</th><th className="th text-right">Modul</th><th className="th text-right">Svetli otvor</th><th className="th text-right">Visina</th></tr></thead>
            <tbody>{project.items.map((it, i) => <tr key={it.id}><td className="td">{i + 1}</td><td className="td">{itemLabel(project.items, i)}</td><td className="td text-slate-600">{describeItem(project, i)}</td><td className="td text-right tabular-nums">{fmtNum(it.widthMm, 0)}</td><td className="td text-right tabular-nums">{fmtNum(layout.items[i].clearWidth, 0)}</td><td className="td text-right tabular-nums">{fmtNum(it.heightMm, 0)}</td></tr>)}</tbody></table>
          <p className="text-xs text-muted mt-2">Dimenzije u mm. Stubova: {layout.postCount} kom.</p>
        </section>
        <section className="card p-4 overflow-x-auto">
          <h2 className="font-bold mb-2">Okovi i automatika</h2>
          {hw.length === 0 ? <p className="text-sm text-muted">Projekat nema kapija.</p> : (
            <table className="w-full min-w-[360px]"><thead><tr><th className="th">Element</th><th className="th">Stavka</th><th className="th text-right">Kom.</th></tr></thead><tbody>{hw.map((h, i) => <tr key={i}><td className="td">{h.element}</td><td className="td">{h.item}</td><td className="td text-right">{h.qty}</td></tr>)}</tbody></table>
          )}
          <h2 className="font-bold mt-5 mb-1">Napomene</h2>
          <p className="text-sm text-slate-600">{project.notes || '—'}</p>
        </section>
      </div>
      <section className="card p-4 mt-5 overflow-x-auto">
        <h2 className="font-bold mb-2">Delovi (okvirno)</h2>
        <table className="w-full min-w-[640px]" data-testid="cut-table"><thead><tr><th className="th">Element</th><th className="th">Deo</th><th className="th">Profil</th><th className="th text-right">Dužina (mm)</th><th className="th text-right">Komada</th><th className="th">Napomena</th></tr></thead>
          <tbody>{cuts.map((c, i) => <tr key={i}><td className="td">{c.element}</td><td className="td">{c.part}</td><td className="td text-slate-600">{c.profile}</td><td className="td text-right tabular-nums">{fmtNum(c.lengthMm, 0)}</td><td className="td text-right">{c.qty}</td><td className="td text-xs text-muted">{c.note}</td></tr>)}</tbody></table>
      </section>
      {rail && (
        <section className="card p-4 mt-5 overflow-x-auto" data-testid="rail04-sheet">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h2 className="font-bold">Model 04 — srebrni stubovi i crne prečke: sastavnica i krojna lista</h2>
            <button className="btn btn-sm" data-testid="rail04-csv" onClick={railCsv}><FileSpreadsheet size={16} />CSV</button>
          </div>
          <p className="text-xs text-muted mb-3">
            {rail.panels.length} {rail.panels.length === 1 ? 'polje' : 'polja'}, {rail.posts.length} stubova (zajednički stub se računa jednom). Mere su planerske i važe za opisanu montažu.
          </p>
          <h3 className="font-semibold text-sm mb-1">Sastavnica</h3>
          <table className="w-full min-w-[720px] mb-4" data-testid="rail04-bom"><thead><tr><th className="th">Poz.</th><th className="th">Deo</th><th className="th">Kataloška oznaka</th><th className="th text-right">Količina</th><th className="th">Napomena</th></tr></thead>
            <tbody>{rail.bom.map((r) => <tr key={r.pos}><td className="td">{r.pos}</td><td className="td">{r.part}</td><td className="td font-medium">{r.code}</td><td className="td text-right whitespace-nowrap">{r.qty}</td><td className="td text-xs text-muted">{r.note}</td></tr>)}</tbody></table>
          <h3 className="font-semibold text-sm mb-1">Krojna lista (mm)</h3>
          <table className="w-full min-w-[720px] mb-2" data-testid="rail04-cuts"><thead><tr><th className="th">Oznaka</th><th className="th">Deo</th><th className="th">Profil</th><th className="th text-right">Komada</th><th className="th text-right">Dužina komada</th><th className="th text-right">Ukupna dužina</th><th className="th">Rez</th></tr></thead>
            <tbody>{rail.cuts.map((c) => <tr key={c.mark}><td className="td font-medium">{c.mark}</td><td className="td">{c.part}</td><td className="td">{c.profile}</td><td className="td text-right">{c.qty}</td><td className="td text-right tabular-nums">{fmtNum(c.lengthMm, 0)}</td><td className="td text-right tabular-nums">{fmtNum(c.totalMm, 0)}</td><td className="td text-xs text-muted">{c.cut}</td></tr>)}</tbody></table>
          <p className="text-sm mb-4">Zbir glavnih profila: <b>{fmtNum(rail.mainTotalMm, 0)} mm ({fmtNum(rail.mainTotalMm / 1000, 2)} m)</b> — to nije dužina gotove ograde.</p>
          <h3 className="font-semibold text-sm mb-1">Raspored na nabavne šipke</h3>
          <table className="w-full min-w-[640px] mb-3" data-testid="rail04-bars"><thead><tr><th className="th">Profil</th><th className="th">Komadi (mm)</th><th className="th text-right">Rezovi (mm)</th><th className="th text-right">Ostatak (mm)</th></tr></thead>
            <tbody>{rail.bars.map((b, i) => <tr key={i}><td className="td">{b.profile}</td><td className="td">{b.pieces}</td><td className="td text-right tabular-nums">{fmtNum(b.cutsMm, 0)}</td><td className="td text-right tabular-nums">{fmtNum(b.leftoverMm, 0)}</td></tr>)}</tbody></table>
          <ul className="list-disc pl-5 text-xs text-slate-600 space-y-0.5">{rail.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </section>
      )}
      {louver && (
        <section className="card p-4 mt-5 overflow-x-auto" data-testid="louver08-sheet">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h2 className="font-bold">Model 08 — svetlosiva horizontalna ispuna: sastavnica i krojna lista</h2>
            <button className="btn btn-sm" data-testid="louver08-csv" onClick={louverCsv}><FileSpreadsheet size={16} />CSV</button>
          </div>
          <p className="text-xs mb-3 rounded-md bg-[#fffaeb] text-[#93370d] border border-[#fedf89] px-3 py-1.5" data-testid="louver08-status">Status: {louver.status}. Podaci radnika i cenovnika nisu potvrđeni; ispod su polja koja se menjaju kad stignu.</p>
          <div className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3 mb-3" data-testid="louver08-fields">
            <SelectField stacked label="Bočna vođica" testId="l08-guide" value={louver.spec.guideProfile} options={Object.entries(GUIDE_PROFILES).map(([value, p]) => ({ value: value as typeof louver.spec.guideProfile, label: p.label }))} onChange={(v) => setSpec({ guideProfile: v })} />
            <SelectField stacked label="Horizontalna ispuna" testId="l08-fill" value={louver.spec.fillProfile} options={Object.entries(FILL_PROFILES).map(([value, p]) => ({ value: value as typeof louver.spec.fillProfile, label: p.label }))} onChange={(v) => setSpec({ fillProfile: v })} />
            <SelectField stacked label="Osnovica cene iz cenovnika" testId="l08-basis" value={louver.spec.priceBasis} options={[{ value: 'per_m', label: 'Po metru (potrošeni metri)' }, { value: 'per_bar', label: 'Po šipki (cele šipke od 6 m)' }]} onChange={(v) => setSpec({ priceBasis: v })} />
            <NumberField label="Zid U vođice (s)" testId="l08-wall" value={louver.spec.wallMm} range={{ min: 0, max: 10 }} allowZero step={1} onCommit={(v) => setSpec({ wallMm: v })} />
            <NumberField label="Montažni zazor (c)" testId="l08-clear" value={louver.spec.clearanceMm} range={{ min: 0, max: 30 }} allowZero step={1} onCommit={(v) => setSpec({ clearanceMm: v })} />
            <NumberField label="Korekcija vođice (završeci)" testId="l08-extra" value={louver.spec.guideExtraMm} range={{ min: -100, max: 100 }} step={1} onCommit={(v) => setSpec({ guideExtraMm: v })} />
            <ToggleField label="Završeci vrha vođica" checked={louver.spec.guideCaps} onLabel="U obračunu" offLabel="Nisu u obračunu" onChange={(v) => setSpec({ guideCaps: v })} />
            <ToggleField label="Završeci krajeva letvica" checked={louver.spec.fillCaps} onLabel="U obračunu" offLabel="Nisu u obračunu" onChange={(v) => setSpec({ fillCaps: v })} />
            <TextField label="Oslonac / pričvršćenje" value={louver.spec.support} onChange={(v) => setSpec({ support: v })} />
          </div>
          <h3 className="font-semibold text-sm mb-1">Paneli</h3>
          <table className="w-full min-w-[560px] mb-3" data-testid="louver08-panels"><thead><tr><th className="th">Panel</th><th className="th text-right">W (mm)</th><th className="th text-right">H (mm)</th><th className="th text-right">Letvica N</th><th className="th text-right">L = W − 2s − c</th><th className="th text-right">H_U</th></tr></thead>
            <tbody>{louver.panels.map((p) => <tr key={p.name}><td className="td">{p.name}</td><td className="td text-right tabular-nums">{fmtNum(p.widthMm, 0)}</td><td className="td text-right tabular-nums">{fmtNum(p.heightMm, 0)}</td><td className="td text-right">{p.count}</td><td className="td text-right tabular-nums">{fmtNum(p.fillLenMm, 0)}</td><td className="td text-right tabular-nums">{fmtNum(p.guideLenMm, 0)}</td></tr>)}</tbody></table>
          <h3 className="font-semibold text-sm mb-1">Sastavnica</h3>
          <table className="w-full min-w-[720px] mb-4" data-testid="louver08-bom"><thead><tr><th className="th">Poz.</th><th className="th">Deo</th><th className="th">Oznaka</th><th className="th text-right">Količina</th><th className="th">Napomena</th></tr></thead>
            <tbody>{louver.bom.map((r) => <tr key={r.pos}><td className="td">{r.pos}</td><td className="td">{r.part}</td><td className="td font-medium">{r.code}</td><td className="td text-right whitespace-nowrap">{r.qty}</td><td className="td text-xs text-muted">{r.note}</td></tr>)}</tbody></table>
          <h3 className="font-semibold text-sm mb-1">Krojna lista (mm)</h3>
          <table className="w-full min-w-[640px] mb-3" data-testid="louver08-cuts"><thead><tr><th className="th">Oznaka</th><th className="th">Deo</th><th className="th">Profil</th><th className="th text-right">Komada</th><th className="th text-right">Dužina komada</th><th className="th text-right">Ukupna dužina</th></tr></thead>
            <tbody>{louver.cuts.map((c) => <tr key={c.mark}><td className="td font-medium">{c.mark}</td><td className="td">{c.part}</td><td className="td">{c.profile}</td><td className="td text-right">{c.qty}</td><td className="td text-right tabular-nums">{fmtNum(c.lengthMm, 0)}</td><td className="td text-right tabular-nums">{fmtNum(c.totalMm, 0)}</td></tr>)}</tbody></table>
          <h3 className="font-semibold text-sm mb-1">Raspored na nabavne šipke</h3>
          <table className="w-full min-w-[560px] mb-3" data-testid="louver08-bars"><thead><tr><th className="th">Profil</th><th className="th">Komadi (mm)</th><th className="th text-right">Ostatak (mm)</th></tr></thead>
            <tbody>{louver.bars.map((b, i) => <tr key={i}><td className="td">{b.profile}</td><td className="td">{b.pieces}</td><td className="td text-right tabular-nums">{fmtNum(b.leftoverMm, 0)}</td></tr>)}</tbody></table>
          <ul className="list-disc pl-5 text-xs text-slate-600 space-y-0.5">{louver.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </section>
      )}
    </Page>
  );
}
