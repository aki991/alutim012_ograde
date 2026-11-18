import { STATUS_LABELS } from '../domain/models/catalog';
import type { AppSettings, Customer, Project } from '../domain/models/types';
import type { Requisition } from '../domain/pricing/requisition';
import { fmtDate } from '../utils/units';
import { getPdfMake, renderBlob } from './pdf';
import { BRAND_RED, docHeader, loadHeaderLogos } from './pdfHeader';
import { INK, LINE, MUTED } from './pdfCutlist';

/* eslint-disable @typescript-eslint/no-explicit-any */

const qtyText = (n: number): string => String(Math.round(n * 100) / 100).replace('.', ',');

/**
 * Trebovanje materijala kao PDF, istog izgleda kao krojna lista i radni nalog: zaglavlje firme, crvena traka, podaci o projektu,
 * kartice sa zbirom i tabela po grupama (naziv, količina, jedinica, napomena). Količine su one iz trebovanja (i ručno izmenjene).
 */
export async function buildRequisitionPdfBlob(project: Project, customer: Customer | null, req: Requisition, settings: AppSettings): Promise<Blob> {
  const pdfMake = await getPdfMake();
  const logos = await loadHeaderLogos();
  const info = settings.companyInfo ?? {};
  const contact = [info.address, info.phone, info.email, info.pib ? `PIB: ${info.pib}` : ''].filter(Boolean).join('  ·  ');
  const lines = req.groups.flatMap((g) => g.lines).filter((l) => l.qty > 0);
  const bars = lines.filter((l) => l.unit === 'šipka');

  const card = (label: string, value: string, color = INK) => ({
    stack: [{ text: label, fontSize: 7.5, color: MUTED, bold: true, characterSpacing: 0.5 }, { text: value, fontSize: 16, bold: true, color, margin: [0, 2, 0, 0] }],
  });
  const infoCell = (label: string, value: string) => ({ stack: [{ text: label, fontSize: 7.5, color: MUTED, bold: true, characterSpacing: 0.5 }, { text: value || '—', fontSize: 10, bold: true, margin: [0, 1, 0, 0] }] });

  const infoRow: any = {
    table: {
      widths: ['*', '*', 'auto', 'auto', 'auto'],
      body: [[
        infoCell('PROJEKAT', project.name),
        infoCell('KUPAC', customer ? [customer.name, customer.address].filter(Boolean).join(', ') : ''),
        infoCell('STATUS', STATUS_LABELS[project.status]),
        infoCell('ŠIPKA', `${req.stockMm} mm`),
        infoCell('DATUM', fmtDate(new Date().toISOString())),
      ]],
    },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => '#f6f4f3', paddingLeft: () => 12, paddingRight: () => 12, paddingTop: () => 8, paddingBottom: () => 8 },
    margin: [0, 0, 0, 8],
  };
  const cards: any = {
    table: {
      widths: ['*', '*', '*', '*'],
      body: [[
        card('STAVKI', String(lines.length)),
        card('VRSTA PROFILA', String(bars.length)),
        card('ŠIPKI ZA NABAVKU', qtyText(bars.reduce((a, l) => a + l.qty, 0)), BRAND_RED),
        card('IZMENJENO RUČNO', String(lines.filter((l) => l.edited).length)),
      ]],
    },
    layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 0 : 0.6), vLineColor: () => LINE, fillColor: () => '#ffffff', paddingLeft: () => 12, paddingTop: () => 6, paddingBottom: () => 6 },
    margin: [0, 0, 0, 10],
  };

  const head = (t: string, align: 'left' | 'right' | 'center' = 'left') => ({ text: t, fontSize: 7.5, bold: true, color: MUTED, alignment: align, characterSpacing: 0.4 });
  const body: any[] = [[head('NAZIV MATERIJALA'), head('KOLIČINA', 'right'), head('JM'), head('NAPOMENA')]];
  for (const g of req.groups) {
    const gl = g.lines.filter((l) => l.qty > 0);
    if (!gl.length) continue;
    body.push([{ text: g.group, colSpan: 4, bold: true, fontSize: 10, fillColor: '#f6f4f3', margin: [2, 3, 0, 3] }, {}, {}, {}]);
    gl.forEach((l) => body.push([
      { text: l.name, fontSize: 10.5, bold: true, margin: [0, 3, 0, 3] },
      { text: qtyText(l.qty), fontSize: 13, bold: true, alignment: 'right', color: l.unit === 'šipka' ? BRAND_RED : INK, margin: [0, 1, 0, 1] },
      { text: l.unit, fontSize: 10, margin: [0, 3, 0, 3] },
      { text: [l.note ?? '', l.edited ? `${l.note ? '  ·  ' : ''}izračunato ${qtyText(l.calc)}` : ''].join(''), fontSize: 8.5, color: MUTED, margin: [0, 3, 0, 3] },
    ]));
  }
  const table: any = lines.length
    ? { table: { headerRows: 1, dontBreakRows: true, widths: ['*', 80, 50, 260], body }, layout: { hLineColor: () => LINE, hLineWidth: (i: number) => (i === 0 ? 0 : 0.5), vLineWidth: () => 0, paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 2, paddingBottom: () => 2 } }
    : { text: 'Projekat nema materijala za trebovanje.', color: MUTED, margin: [0, 8, 0, 0] };

  const def: any = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [28, 26, 28, 38],
    defaultStyle: { font: 'Roboto', fontSize: 9.5, color: INK },
    info: { title: `Trebovanje — ${project.name}`, author: settings.companyName },
    footer: (page: number, pages: number) => ({
      columns: [
        { text: `${settings.companyName}  ·  Trebovanje  ·  ${project.name}`, fontSize: 8, color: MUTED },
        { text: `Strana ${page} od ${pages}`, alignment: 'right', fontSize: 8, color: MUTED },
      ],
      margin: [28, 12, 28, 0],
    }),
    content: [
      docHeader('TREBOVANJE', `Ponuda: ${project.quoteNo || '—'}  ·  ${fmtDate(new Date().toISOString())}`, settings.companyName, contact, logos),
      { canvas: [{ type: 'rect', x: 0, y: 0, w: 786, h: 3, color: BRAND_RED }], margin: [0, 0, 0, 8] },
      infoRow,
      cards,
      table,
      {
        margin: [0, 12, 0, 0],
        unbreakable: true,
        stack: [
          { text: 'Napomene', fontSize: 10, bold: true, margin: [0, 0, 0, 3] },
          { ul: [`Profili se poručuju u celim šipkama od ${req.stockMm} mm, prema rasporedu komada iz krojne liste.`, 'Količine su proverene i po potrebi ručno izmenjene pre štampe.', ...(project.notes ? [`Napomena projekta: ${project.notes}`] : [])], fontSize: 8.5, color: MUTED },
          { columns: [{ text: 'Trebovao: ________________', fontSize: 9, margin: [0, 18, 0, 0] }, { text: 'Odobrio: ________________', fontSize: 9, alignment: 'right', margin: [0, 18, 0, 0] }] },
        ],
      },
    ],
  };
  return renderBlob(pdfMake, def);
}
