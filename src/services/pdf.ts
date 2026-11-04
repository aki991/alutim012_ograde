import { buildRl10Sheet } from '../domain/pricing/rl10Spec';
import { FENCE_MODELS, STATUS_LABELS } from '../domain/models/catalog';
import type { AppSettings, Customer, Material, Project } from '../domain/models/types';
import { buildBom, computePrice } from '../domain/pricing/calc';
import { buildCutList, buildHardwareList, describeItem } from '../domain/pricing/production';
import { buildLouver08Sheet } from '../domain/pricing/louverSpec';
import { buildRail04Sheet } from '../domain/pricing/railSpec';
import { computeLayout, isSpacer, outerWidthMm } from '../domain/geometry/layout';
import { itemLabel, itemNumber } from '../utils/labels';
import { fmtDate, fmtMoney, fmtNum } from '../utils/units';
import { downloadBlob, frontViewPng, safeFilename, topViewPng } from './exports';
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
  const price = computePrice(project, materials, settings.modelSpecs);
  const bom = buildBom(project, materials, settings.modelSpecs);
  const layout = computeLayout(project);
  const sketch = await frontViewPng(project, 1500);
  const logos = await loadHeaderLogos();
  // pogled odozgo i 3D prikaz; ako se ne mogu napraviti (npr. nema WebGL), ponuda ide bez njih
  const top = project.items.length ? await topViewPng(project).catch(() => null) : null;
  const view3d = project.items.length ? await import('./scene3dImage').then((m) => m.scene3dJpeg(project)).catch(() => null) : null;
  const info = settings.companyInfo ?? {};
  const contact = [info.address, info.phone, info.email, info.pib ? `PIB: ${info.pib}` : ''].filter(Boolean).join('  ·  ');
  const demo = materials.some((m) => m.demo) || !project.quoteNo;
  const cur = settings.currency;
  const rate = settings.currencyRateToEur;
  const money = (n: number) => fmtMoney(n, cur, rate);
  const pr = project.settings.pricing;

  const itemRows = project.items.flatMap((it, i) => (isSpacer(it) ? [] : [[
    td(itemNumber(project.items, i), 'center'),
    td(itemLabel(project.items, i)),
    td(describeItem(project, i)),
    td(fmtNum(outerWidthMm(project, i), 0), 'right'),
    td(fmtNum(it.heightMm, 0), 'right'),
    td(it.kind === 'opening' ? '—' : it.color),
  ]]));

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
          { width: '50%', stack: [{ text: 'PROJEKAT', fontSize: 8, color: MUTED, bold: true }, { text: project.name, bold: true }, { text: `Status: ${STATUS_LABELS[project.status]}`, color: MUTED }, { text: `Ukupna dužina: ${fmtNum(layout.occupiedMm, 0)} mm · Elemenata: ${project.items.filter((x) => !isSpacer(x)).length}`, color: MUTED }] },
        ],
      },
      { image: sketch.dataUrl, width: 523, margin: [0, 0, 0, 10] },
      ...(top ? [{ unbreakable: true, stack: [{ text: 'Pogled odozgo', style: 'h2' }, { image: top.dataUrl, fit: [523, 330], alignment: 'center', margin: [0, 0, 0, 10] }] }] : []),
      ...(view3d ? [{ unbreakable: true, stack: [{ text: '3D prikaz', style: 'h2' }, { image: view3d.dataUrl, width: 523, margin: [0, 0, 0, 10] }] }] : []),
      { text: 'Lista elemenata', style: 'h2' },
      {
        table: { headerRows: 1, widths: [22, 85, '*', 50, 50, 55], body: [[th('R.br.', 'center'), th('Element'), th('Model'), th('Širina (mm)', 'right'), th('Visina (mm)', 'right'), th('Boja')], ...itemRows] },
        layout: tableLayout,
      },
      { text: 'Širine su modularni rasponi (osa–osa stubova); stvarne proizvodne mere zavise od sistema profila.', fontSize: 8, color: MUTED, margin: [0, 3, 0, 10] },
      { text: 'Specifikacija materijala', style: 'h2' },
      {
        table: {
          headerRows: 1, dontBreakRows: true, widths: [52, '*', 24, 44, 52, 56],
          body: [
            [th('Šifra'), th('Naziv'), th('JM'), th('Količ.', 'right'), th(`Cena (${cur})`, 'right'), th(`Ukupno (${cur})`, 'right')],
            ...bom.map((l) => [td(l.sku, 'left', { fontSize: 7.5 }), td(l.name), td(l.unit), td(fmtNum(l.purchaseQty, l.unit === 'kom' ? 0 : 2), 'right'), td(fmtNum(l.unitPriceNet, 2), 'right'), td(fmtNum(l.total, 0), 'right')]),
          ],
        },
        layout: tableLayout,
      },
      { text: 'Obračun cene', style: 'h2', pageBreak: undefined, margin: [0, 12, 0, 4] },
      {
        unbreakable: true,
        table: {
          widths: ['*', 200, 90],
          body: [
            [th('Stavka'), th('Osnovica'), th('Iznos', 'right')],
            ...price.rows.map((r) => [td(r.label, 'left', { bold: r.emphasis }), td(r.base, 'left', { color: MUTED, fontSize: 8 }), td(money(r.amount), 'right', { bold: r.emphasis })]),
          ],
        },
        layout: tableLayout,
      },
      {
        margin: [0, 10, 0, 0],
        unbreakable: true,
        table: { widths: ['*', 140], body: [[{ text: 'UKUPNO ZA UPLATU', bold: true, fontSize: 12, fillColor: '#eaf1ff' }, { text: money(price.grossTotal), bold: true, fontSize: 13, alignment: 'right', fillColor: '#eaf1ff' }]] },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingTop: () => 8, paddingBottom: () => 8 },
      },
      { text: `Marža/uvećanje: ${pr.profitMode === 'margin' ? 'marža' : 'uvećanje'} ${pr.profitPercent}% · Popust ${pr.discountPercent}% · PDV ${pr.vatPercent}%${pr.pricesIncludeVat ? ' (cene u cenovniku su bruto)' : ''}.`, fontSize: 8, color: MUTED, margin: [0, 6, 0, 0] },
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

export async function buildProductionPdfBlob(project: Project, customer: Customer | null, settings: AppSettings): Promise<Blob> {
  const pdfMake = await getPdfMake();
  const sketch = await frontViewPng(project, 1500);
  const cuts = buildCutList(project, settings.modelSpecs);
  const hw = buildHardwareList(project);
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
      { text: 'OKVIRNA geometrijska specifikacija — nije finalna proizvodna dokumentacija niti optimizacija sečenja. Svi podaci su demonstracioni.', color: '#b45309', bold: true, fontSize: 9, margin: [0, 4, 0, 8] },
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
      { text: `Stubovi: ${layout.postCount} kom (svaki zajednički stub je računat jednom).`, margin: [0, 8, 0, 0] },
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

export async function downloadProductionPdf(project: Project, customer: Customer | null, settings: AppSettings): Promise<void> {
  downloadBlob(await buildProductionPdfBlob(project, customer, settings), `proizvodnja_${safeFilename(project.name)}.pdf`);
}

/**
 * Cenovnik materijala kao PDF tabela. Sve ćelije imaju pozadinu (nacrtane ćelije), pa aplikacija ovaj PDF
 * može da pročita nazad preko „Uvezi materijale" kao i PDF dobavljača.
 */
export async function buildMaterialsPdfBlob(materials: Material[], settings: AppSettings): Promise<Blob> {
  const pdfMake = await getPdfMake();
  const cats: Record<string, string> = { profil: 'Profili', stub: 'Stubovi', okov: 'Okovi', automatika: 'Automatika', staklo: 'Staklo', panel: 'Paneli', ostalo: 'Ostalo' };
  const head = (t: string, align: 'left' | 'right' = 'left') => ({ text: t, bold: true, fontSize: 8.5, color: INK, alignment: align, fillColor: '#ffc247', margin: [2, 3, 2, 3] });
  const cell = (t: string | number, align: 'left' | 'right' = 'left', extra: object = {}) => ({ text: String(t), fontSize: 8.5, alignment: align, fillColor: '#ffffff', margin: [2, 3, 2, 3], ...extra });
  const body = materials.map((m) => [cell(m.sku), cell(m.name), cell(cats[m.category] ?? m.category), cell(m.unit), cell(fmtNum(m.unitPrice, 2), 'right'), cell(fmtNum(m.wastePercent, 1), 'right')]);
  const def: any = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [28, 34, 28, 34],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: INK },
    footer: (page: number, pages: number) => ({ text: `${settings.companyName} · ${page} / ${pages}`, alignment: 'center', fontSize: 8, color: MUTED }),
    content: [
      { text: 'Cenovnik materijala', fontSize: 16, bold: true },
      { text: `${settings.companyName} · ${fmtDate(new Date().toISOString())} · ${materials.length} materijala · cene neto (${settings.currency}) po jedinici`, color: MUTED, margin: [0, 2, 0, 10] },
      {
        table: {
          headerRows: 1,
          widths: [80, '*', 70, 40, 85, 55],
          body: [[head('Šifra'), head('Naziv'), head('Kategorija'), head('Jedinica'), head(`Cena (${settings.currency}, neto)`, 'right'), head('Otpad %', 'right')], ...body],
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
