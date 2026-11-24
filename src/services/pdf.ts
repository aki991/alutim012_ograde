import { computePrice } from '../domain/pricing/calc';
import { buildRl10Sheet } from '../domain/pricing/rl10Spec';
import { colorText, FENCE_MODELS, STATUS_LABELS } from '../domain/models/catalog';
import type { AppSettings, Customer, Material, Project } from '../domain/models/types';
import { buildQuotePrices, quoteDisplayAmounts } from '../domain/pricing/quote';
import { productionPostCount } from '../domain/models/productionPosts';
import { buildCutList, buildHardwareList, describeItem } from '../domain/pricing/production';
import { buildLouver08Sheet } from '../domain/pricing/louverSpec';
import { buildRail04Sheet } from '../domain/pricing/railSpec';
import { computeLayout, isSpacer, railingWidthMm } from '../domain/geometry/layout';
import { itemLabel, itemNumber } from '../utils/labels';
import { fmtDate, fmtNum } from '../utils/units';
import { buildMaterialList, materialListRows, materialQtyText } from '../domain/pricing/materialList';
import { downloadBlob, downloadCsv, frontViewPng, safeFilename } from './exports';
import { BRAND_RED, docHeader, loadHeaderLogos } from './pdfHeader';

/* eslint-disable @typescript-eslint/no-explicit-any */
let pdfMakePromise: Promise<any> | null = null;

export async function getPdfMake(): Promise<any> {
  if (!pdfMakePromise) {
    pdfMakePromise = (async () => {
      const [pm, vfs] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
      const pdfMake: any = (pm as any).default ?? pm;
      const files: any = (vfs as any).default ?? vfs;
      pdfMake.addVirtualFileSystem(files);
      // Roboto podržava č, ć, š, ž, đ (Latin Extended-A)
      pdfMake.setFonts({ Roboto: { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' } });
      return pdfMake;
    })();
  }
  return pdfMakePromise;
}

const INK = '#1a1a1a';
const MUTED = '#64748b';
const tableLayout = {
  hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 0.8 : 0.4),
  vLineWidth: () => 0,
  hLineColor: () => '#cbd5e1',
  paddingTop: () => 4,
  paddingBottom: () => 4,
  fillColor: (row: number) => (row === 0 ? '#eef2f7' : null),
};

const th = (t: string, align: 'left' | 'right' | 'center' = 'left') => ({ text: t, bold: true, fontSize: 8.5, color: MUTED, alignment: align });
const td = (t: string | number, align: 'left' | 'right' | 'center' = 'left', extra: object = {}) => ({ text: String(t), fontSize: 9, alignment: align, ...extra });

export async function renderBlob(pdfMake: any, def: any): Promise<Blob> {
  return pdfMake.createPdf(def).getBlob();
}

export async function buildQuotePdfBlob(project: Project, customer: Customer | null, materials: Material[], settings: AppSettings): Promise<Blob> {
  const pdfMake = await getPdfMake();
  const incomplete = computePrice(project, materials, settings.modelSpecs).unpricedCount;
  const price = buildQuotePrices(project, materials, settings.modelSpecs);
  const display = quoteDisplayAmounts(price, settings.currency, settings.currencyRateToEur);
  const layout = computeLayout(project);
  const sketch = await frontViewPng(project, 1500);
  const logos = await loadHeaderLogos();
  const info = settings.companyInfo ?? {};
  const contact = [info.address, info.phone, info.email, info.pib ? `PIB: ${info.pib}` : ''].filter(Boolean).join('  ·  ');
  const demo = materials.some((m) => m.demo) || !project.quoteNo;
  const cur = settings.currency;
  const money = (n: number) => `${fmtNum(n, display.digits)} ${cur === 'EUR' ? '€' : cur}`;

  const itemRows = price.elements.map(({ index: i }, n) => {
    const it = project.items[i];
    return [
      td(itemNumber(project.items, i), 'center'),
      { stack: [td(itemLabel(project.items, i), 'left', { bold: true }), { text: `${describeItem(project, i)} · ${fmtNum(railingWidthMm(project, i), 0)} × ${fmtNum(it.heightMm, 0)} mm${it.kind === 'opening' ? '' : ` · ${colorText(it.color, it.finish)}`}`, fontSize: 8, color: MUTED }] },
      td(money(display.elements[n]), 'right', { bold: true }),
    ];
  });

  const def: any = {
    pageSize: 'A4',
    pageMargins: [36, 40, 36, 50],
    defaultStyle: { font: 'Roboto', fontSize: 9.5, color: INK },
    info: { title: `Ponuda ${project.quoteNo} — ${project.name}`, author: settings.companyName },
    footer: (page: number, pages: number) => ({
      columns: [
        { text: `${settings.companyName} · Ponuda ${project.quoteNo}`, fontSize: 8, color: MUTED },
        { text: `Strana ${page} od ${pages}`, alignment: 'right', fontSize: 8, color: MUTED },
      ],
      margin: [36, 12, 36, 0],
    }),
    content: [
      docHeader('PONUDA', `Broj: ${project.quoteNo || '—'}  ·  ${fmtDate(new Date().toISOString())}`, settings.companyName, contact, logos),
      { canvas: [{ type: 'rect', x: 0, y: 0, w: 523, h: 3, color: BRAND_RED }], margin: [0, 0, 0, 4] },
      demo ? { text: 'DEMONSTRACIONA PONUDA — svi podaci, dimenzije i cene su ilustrativni i ne predstavljaju ponudu ni specifikaciju proizvođača.', margin: [0, 10, 0, 0], color: '#b45309', bold: true, fontSize: 9 } : {},
      {
        margin: [0, 14, 0, 10],
        columns: [
          { width: '50%', stack: [{ text: 'KUPAC', fontSize: 8, color: MUTED, bold: true }, { text: customer?.name ?? 'Nije izabran', bold: true }, { text: customer?.address ?? '', color: MUTED }, { text: [customer?.phone, customer?.email].filter(Boolean).join(' · '), color: MUTED }] },
          { width: '50%', stack: [{ text: 'PROJEKAT', fontSize: 8, color: MUTED, bold: true }, { text: project.name, bold: true }, { text: `Ukupna dužina: ${fmtNum(layout.railingLengthMm, 0)} mm · Elemenata: ${price.elements.length}`, color: MUTED }] },
        ],
      },
      { image: sketch.dataUrl, fit: [523, 300], alignment: 'center', margin: [0, 0, 0, 10] },
      incomplete ? { text: `OBRAČUN NIJE POTPUN — stavki sa nedostupnom ili nultom cenom: ${incomplete}. Prikazani iznos uključuje samo unete cene; proverite nulte cene.`, color: '#93370d', fillColor: '#fffaeb', bold: true, margin: [0, 6, 0, 8] } : {},
      { text: 'Cena elemenata ograde', style: 'h2' },
      {
        table: { headerRows: 1, dontBreakRows: true, widths: [24, '*', 110], body: [[th('R.br.', 'center'), th('Element'), th('Cena sa PDV-om', 'right')], ...itemRows] },
        layout: tableLayout,
      },
      {
        margin: [0, 10, 0, 0],
        unbreakable: true,
        table: { widths: ['*', 140], body: [[{ text: 'UKUPNO', bold: true, fontSize: 12, fillColor: '#eaf1ff' }, { text: money(display.total), bold: true, fontSize: 13, alignment: 'right', fillColor: '#eaf1ff' }]] },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingTop: () => 8, paddingBottom: () => 8 },
      },
      project.notes ? { text: [{ text: 'Napomena: ', bold: true }, project.notes], margin: [0, 10, 0, 0] } : {},
    ],
    styles: { h2: { fontSize: 12, bold: true, margin: [0, 6, 0, 4] } },
  };
  return renderBlob(pdfMake, def);
}

export async function downloadQuotePdf(project: Project, customer: Customer | null, materials: Material[], settings: AppSettings): Promise<void> {
  const blob = await buildQuotePdfBlob(project, customer, materials, settings);
  downloadBlob(blob, `ponuda_${safeFilename(project.quoteNo || project.name)}.pdf`);
}

/** Spisak materijala projekta (bez cena) kao PDF: za nabavku i radionicu. */
export async function buildProjectMaterialsPdfBlob(project: Project, customer: Customer | null, materials: Material[], settings: AppSettings): Promise<Blob> {
  const pdfMake = await getPdfMake();
  const groups = buildMaterialList(project, materials, settings.modelSpecs);
  const logos = await loadHeaderLogos();
  const info = settings.companyInfo ?? {};
  const contact = [info.address, info.phone, info.email, info.pib ? `PIB: ${info.pib}` : ''].filter(Boolean).join('  ·  ');
  const count = groups.reduce((n, g) => n + g.lines.length, 0);
  const rows = groups.flatMap((g) => [
    [{ text: g.group, colSpan: 4, bold: true, fontSize: 9, fillColor: '#f1f5f9', margin: [0, 2, 0, 2] }, {}, {}, {}],
    ...g.lines.map((l) => [td(l.name), td(l.unit), td(materialQtyText(l.needed, l.unit), 'right'), td(materialQtyText(l.purchase, l.unit), 'right', { bold: true })]),
  ]);
  const def: any = {
    pageSize: 'A4',
    pageMargins: [36, 40, 36, 50],
    defaultStyle: { font: 'Roboto', fontSize: 9.5, color: INK },
    info: { title: `Spisak materijala — ${project.name}`, author: settings.companyName },
    footer: (page: number, pages: number) => ({
      columns: [
        { text: `${settings.companyName} · Spisak materijala · ${project.name}`, fontSize: 8, color: MUTED },
        { text: `Strana ${page} od ${pages}`, alignment: 'right', fontSize: 8, color: MUTED },
      ],
      margin: [36, 12, 36, 0],
    }),
    content: [
      docHeader('SPISAK MATERIJALA', `${project.quoteNo ? `Ponuda ${project.quoteNo}  ·  ` : ''}${fmtDate(new Date().toISOString())}`, settings.companyName, contact, logos),
      { canvas: [{ type: 'rect', x: 0, y: 0, w: 523, h: 3, color: BRAND_RED }], margin: [0, 0, 0, 4] },
      {
        margin: [0, 12, 0, 10],
        columns: [
          { width: '50%', stack: [{ text: 'PROJEKAT', fontSize: 8, color: MUTED, bold: true }, { text: project.name, bold: true }, { text: `Status: ${STATUS_LABELS[project.status]}`, color: MUTED }] },
          { width: '50%', stack: [{ text: 'KUPAC', fontSize: 8, color: MUTED, bold: true }, { text: customer?.name ?? 'Nije izabran', bold: true }, { text: [customer?.phone, customer?.address].filter(Boolean).join(' · '), color: MUTED }] },
        ],
      },
      count === 0
        ? { text: 'Projekat nema elemenata, pa nema ni materijala.', color: MUTED }
        : {
          table: {
            headerRows: 1, dontBreakRows: true, widths: ['*', 28, 62, 78],
            body: [[th('Naziv'), th('JM'), th('Potrebno', 'right'), th('Za nabavku', 'right')], ...rows],
          },
          layout: tableLayout,
        },
      { text: '„Potrebno“ je količina prema crtežu. „Za nabavku“ uključuje otpad kod profila (m, m²) i zaokruživanje komada naviše.', fontSize: 8, color: MUTED, margin: [0, 6, 0, 0] },
    ],
  };
  return renderBlob(pdfMake, def);
}

export async function downloadProjectMaterialsPdf(project: Project, customer: Customer | null, materials: Material[], settings: AppSettings): Promise<void> {
  downloadBlob(await buildProjectMaterialsPdfBlob(project, customer, materials, settings), `spisak_materijala_${safeFilename(project.quoteNo || project.name)}.pdf`);
}

/** Spisak materijala projekta kao tabela (CSV, otvara se u Excelu). */
export function downloadProjectMaterialsCsv(project: Project, customer: Customer | null, materials: Material[], settings: AppSettings): void {
  const rows = materialListRows(project, customer?.name ?? null, buildMaterialList(project, materials, settings.modelSpecs));
  downloadCsv(rows, `spisak_materijala_${safeFilename(project.quoteNo || project.name)}.csv`);
}

export async function buildProductionPdfBlob(project: Project, customer: Customer | null, settings: AppSettings, materials?: Material[]): Promise<Blob> {
  const pdfMake = await getPdfMake();
  const sketch = await frontViewPng(project, 1500, { production: true });
  const cuts = buildCutList(project, settings.modelSpecs, materials);
  const hw = buildHardwareList(project, materials);
  const rail = buildRail04Sheet(project, settings.modelSpecs);
  const rl10 = buildRl10Sheet(project, settings.modelSpecs);
  const louver = buildLouver08Sheet(project, settings.modelSpecs);
  const layout = computeLayout(project);
  const def: any = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [30, 36, 30, 44],
    defaultStyle: { font: 'Roboto', fontSize: 9.5, color: INK },
    footer: (page: number, pages: number) => ({ text: `${settings.companyName} · Proizvodna specifikacija · Strana ${page} od ${pages}`, alignment: 'right', fontSize: 8, color: MUTED, margin: [30, 12, 30, 0] }),
    content: [
      { text: 'PROIZVODNA SPECIFIKACIJA', fontSize: 18, bold: true },
      { text: 'OKVIRNA geometrijska specifikacija — nije finalna proizvodna dokumentacija niti optimizacija sečenja.', color: '#b45309', bold: true, fontSize: 9, margin: [0, 4, 0, 8] },
      { text: `${project.name} · Kupac: ${customer?.name ?? '—'} · Status: ${STATUS_LABELS[project.status]} · Ponuda: ${project.quoteNo || '—'}`, margin: [0, 0, 0, 8] },
      { image: sketch.dataUrl, width: 560, alignment: 'center', margin: [0, 0, 0, 8] },
      { text: 'Redosled elemenata i dimenzije', style: 'h2' },
      {
        table: {
          headerRows: 1, widths: [24, 100, '*', 60, 60, 60, 60],
          body: [
            [th('#', 'center'), th('Element'), th('Model'), th('Modul (mm)', 'right'), th('Svetli otvor (mm)', 'right'), th('Visina (mm)', 'right'), th('Boja')],
            ...project.items.flatMap((it, i) => (isSpacer(it) ? [] : [[td(itemNumber(project.items, i), 'center'), td(itemLabel(project.items, i)), td(describeItem(project, i)), td(fmtNum(it.widthMm, 0), 'right'), td(fmtNum(layout.items[i].clearWidth, 0), 'right'), td(fmtNum(it.heightMm, 0), 'right'), td(it.kind === 'opening' ? '—' : it.color)]])),
          ],
        },
        layout: tableLayout,
      },
      { text: 'Delovi (okvirno)', style: 'h2', margin: [0, 12, 0, 4] },
      {
        table: {
          headerRows: 1, dontBreakRows: true, widths: [90, 130, '*', 60, 40, 100],
          body: [
            [th('Element'), th('Deo'), th('Profil'), th('Dužina (mm)', 'right'), th('Kom.', 'right'), th('Napomena')],
            ...cuts.map((c) => [td(c.element), td(c.part), td(c.profile), td(fmtNum(c.lengthMm, 0), 'right'), td(c.qty, 'right'), td(c.note ?? '')]),
          ],
        },
        layout: tableLayout,
      },
      { text: 'Okovi i automatika', style: 'h2', margin: [0, 12, 0, 4] },
      hw.length
        ? { table: { headerRows: 1, widths: [150, '*', 40], body: [[th('Element'), th('Stavka'), th('Kom.', 'right')], ...hw.map((h) => [td(h.element), td(h.item), td(h.qty, 'right')])] }, layout: tableLayout }
        : { text: 'Nema kapija u projektu.', color: MUTED },
      { text: `Stubovi za izradu: ${productionPostCount(project, layout)} kom (svaki zajednički stub je računat jednom).`, margin: [0, 8, 0, 0] },
      project.notes ? { text: [{ text: 'Napomene: ', bold: true }, project.notes], margin: [0, 8, 0, 0] } : {},
      ...(rail ? [
        { text: 'Model 04 — sastavnica', style: 'h2', margin: [0, 14, 0, 4], pageBreak: 'before' },
        { table: { headerRows: 1, dontBreakRows: true, widths: [26, '*', 120, 110, '*'], body: [[th('Poz.'), th('Deo'), th('Kataloška oznaka'), th('Količina', 'right'), th('Napomena')], ...rail.bom.map((r) => [td(r.pos), td(r.part), td(r.code), td(r.qty, 'right'), td(r.note)])] }, layout: tableLayout },
        { text: 'Model 04 — krojna lista (mm)', style: 'h2', margin: [0, 12, 0, 4] },
        { table: { headerRows: 1, dontBreakRows: true, widths: [40, '*', 90, 50, 70, 70, '*'], body: [[th('Oznaka'), th('Deo'), th('Profil'), th('Kom.', 'right'), th('Dužina', 'right'), th('Ukupno', 'right'), th('Rez')], ...rail.cuts.map((c) => [td(c.mark), td(c.part), td(c.profile), td(c.qty, 'right'), td(fmtNum(c.lengthMm, 0), 'right'), td(fmtNum(c.totalMm, 0), 'right'), td(c.cut)])] }, layout: tableLayout },
        { text: `Zbir glavnih profila: ${fmtNum(rail.mainTotalMm, 0)} mm (${fmtNum(rail.mainTotalMm / 1000, 2)} m).`, margin: [0, 6, 0, 0] },
        { text: 'Raspored na nabavne šipke', style: 'h2', margin: [0, 10, 0, 4] },
        { table: { headerRows: 1, dontBreakRows: true, widths: ['*', '*', 80, 80], body: [[th('Profil'), th('Komadi (mm)'), th('Rezovi (mm)', 'right'), th('Ostatak (mm)', 'right')], ...rail.bars.map((b) => [td(b.profile), td(b.pieces), td(fmtNum(b.cutsMm, 0), 'right'), td(fmtNum(b.leftoverMm, 0), 'right')])] }, layout: tableLayout },
        { ul: rail.notes, fontSize: 8.5, color: MUTED, margin: [0, 8, 0, 0] },
      ] : []),
      ...(rl10 ? [
        { text: `${rl10.title} — sastavnica`, style: 'h2', margin: [0, 14, 0, 4], pageBreak: 'before' },
        { table: { headerRows: 1, dontBreakRows: true, widths: [26, '*', 120, 110, '*'], body: [[th('Poz.'), th('Deo'), th('Kataloška oznaka'), th('Količina', 'right'), th('Napomena')], ...rl10.bom.map((r) => [td(r.pos), td(r.part), td(r.code), td(r.qty, 'right'), td(r.note)])] }, layout: tableLayout },
        { text: `${rl10.title} — krojna lista (mm)`, style: 'h2', margin: [0, 12, 0, 4] },
        { table: { headerRows: 1, dontBreakRows: true, widths: [40, '*', 90, 50, 70, 70, '*'], body: [[th('Oznaka'), th('Deo'), th('Profil'), th('Kom.', 'right'), th('Dužina', 'right'), th('Ukupno', 'right'), th('Rez')], ...rl10.cuts.map((c) => [td(c.mark), td(c.part), td(c.profile), td(c.qty, 'right'), td(fmtNum(c.lengthMm, 0), 'right'), td(fmtNum(c.totalMm, 0), 'right'), td(c.cut)])] }, layout: tableLayout },
        { text: `Zbir glavnih profila: ${fmtNum(rl10.mainTotalMm, 0)} mm (${fmtNum(rl10.mainTotalMm / 1000, 2)} m).`, margin: [0, 6, 0, 0] },
        { text: 'Raspored na nabavne šipke', style: 'h2', margin: [0, 10, 0, 4] },
        { table: { headerRows: 1, dontBreakRows: true, widths: ['*', '*', 80, 80], body: [[th('Profil'), th('Komadi (mm)'), th('Rezovi (mm)', 'right'), th('Ostatak (mm)', 'right')], ...rl10.bars.map((b) => [td(b.profile), td(b.pieces), td(fmtNum(b.cutsMm, 0), 'right'), td(fmtNum(b.leftoverMm, 0), 'right')])] }, layout: tableLayout },
        { ul: rl10.notes, fontSize: 8.5, color: MUTED, margin: [0, 8, 0, 0] },
      ] : []),
      ...(louver ? [
        { text: 'Model 08 — sastavnica (radno, čeka potvrdu profila i spoja)', style: 'h2', margin: [0, 14, 0, 4], pageBreak: 'before' },
        { text: louver.notes[0], color: '#b45309', fontSize: 9, margin: [0, 0, 0, 6] },
        { table: { headerRows: 1, dontBreakRows: true, widths: [26, '*', 120, 110, '*'], body: [[th('Poz.'), th('Deo'), th('Oznaka'), th('Količina', 'right'), th('Napomena')], ...louver.bom.map((r) => [td(r.pos), td(r.part), td(r.code), td(r.qty, 'right'), td(r.note)])] }, layout: tableLayout },
        { text: 'Model 08 — krojna lista (mm)', style: 'h2', margin: [0, 12, 0, 4] },
        { table: { headerRows: 1, dontBreakRows: true, widths: [40, '*', 110, 50, 80, 80], body: [[th('Oznaka'), th('Deo'), th('Profil'), th('Kom.', 'right'), th('Dužina', 'right'), th('Ukupno', 'right')], ...louver.cuts.map((c) => [td(c.mark), td(c.part), td(c.profile), td(c.qty, 'right'), td(fmtNum(c.lengthMm, 0), 'right'), td(fmtNum(c.totalMm, 0), 'right')])] }, layout: tableLayout },
        { text: 'Raspored na nabavne šipke', style: 'h2', margin: [0, 10, 0, 4] },
        { table: { headerRows: 1, dontBreakRows: true, widths: ['*', '*', 90], body: [[th('Profil'), th('Komadi (mm)'), th('Ostatak (mm)', 'right')], ...louver.bars.map((b) => [td(b.profile), td(b.pieces), td(fmtNum(b.leftoverMm, 0), 'right')])] }, layout: tableLayout },
        { ul: louver.notes.slice(1), fontSize: 8.5, color: MUTED, margin: [0, 8, 0, 0] },
      ] : []),
    ],
    styles: { h2: { fontSize: 12, bold: true, margin: [0, 4, 0, 4] } },
  };
  return renderBlob(pdfMake, def);
}

export async function downloadProductionPdf(project: Project, customer: Customer | null, settings: AppSettings, materials?: Material[]): Promise<void> {
  downloadBlob(await buildProductionPdfBlob(project, customer, settings, materials), `proizvodnja_${safeFilename(project.name)}.pdf`);
}

/**
 * Cenovnik materijala kao PDF tabela. Sve ćelije imaju pozadinu (nacrtane ćelije), pa aplikacija ovaj PDF
 * može da pročita nazad preko „Uvezi materijale" kao i PDF dobavljača.
 */
export async function buildMaterialsPdfBlob(materials: Material[], settings: AppSettings): Promise<Blob> {
  const pdfMake = await getPdfMake();
  const cats: Record<string, string> = { profil: 'Profili', stub: 'Stubovi', zavrsetak: 'Kape i završeci', montaza: 'Stope i spojni elementi', okov: 'Okovi', automatika: 'Automatika', staklo: 'Staklo', panel: 'Paneli', ostalo: 'Ostalo' };
  const head = (t: string, align: 'left' | 'right' = 'left') => ({ text: t, bold: true, fontSize: 8.5, color: INK, alignment: align, fillColor: '#ffc247', margin: [2, 3, 2, 3] });
  const cell = (t: string | number, align: 'left' | 'right' = 'left', extra: object = {}) => ({ text: String(t), fontSize: 8.5, alignment: align, fillColor: '#ffffff', margin: [2, 3, 2, 3], ...extra });
  const { materialPriceInUnit, selectedPriceUnit, MATERIAL_UNIT_LABELS } = await import('../domain/models/materialUnits');
  const body = materials.map((m) => [cell(m.name), cell(cats[m.category] ?? m.category), cell(MATERIAL_UNIT_LABELS[selectedPriceUnit(m)]), cell(fmtNum(materialPriceInUnit(m), 2), 'right'), cell(fmtNum(m.wastePercent, 1), 'right')]);
  const def: any = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [28, 34, 28, 34],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: INK },
    footer: (page: number, pages: number) => ({ text: `${settings.companyName} · ${page} / ${pages}`, alignment: 'center', fontSize: 8, color: MUTED }),
    content: [
      { text: 'Cenovnik materijala', fontSize: 16, bold: true },
      { text: `${settings.companyName} · ${fmtDate(new Date().toISOString())} · ${materials.length} materijala · cene neto (RSD) po jedinici`, color: MUTED, margin: [0, 2, 0, 10] },
      {
        table: {
          headerRows: 1,
          widths: ['*', 70, 40, 85, 55],
          body: [[head('Naziv'), head('Kategorija'), head('Jedinica'), head('Cena (RSD, neto)', 'right'), head('Otpad %', 'right')], ...body],
        },
        layout: { hLineWidth: () => 0.4, vLineWidth: () => 0.4, hLineColor: () => '#cbd5e1', vLineColor: () => '#cbd5e1' },
      },
    ],
  };
  return renderBlob(pdfMake, def);
}

export async function downloadMaterialsPdf(materials: Material[], settings: AppSettings): Promise<void> {
  downloadBlob(await buildMaterialsPdfBlob(materials, settings), `materijali_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export const modelName = (id: keyof typeof FENCE_MODELS) => FENCE_MODELS[id].name;
