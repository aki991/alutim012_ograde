import { STATUS_LABELS } from '../domain/models/catalog';
import type { AppSettings, Customer, Material, Project } from '../domain/models/types';
import { cutOptions } from '../domain/pricing/cutting';
import { buildWorkOrder, type WorkElement } from '../domain/pricing/workorder';
import { fmtDate, fmtNum } from '../utils/units';
import { positionColors } from './cutlistSvg';
import { BRAND_RED, INK, LINE, MUTED, docHeader, fmtMm, svgToPng } from './pdfCutlist';
import { loadHeaderLogos } from './pdfHeader';
import { downloadBlob, safeFilename } from './exports';
import { getPdfMake, renderBlob } from './pdf';
import { schemaSvg } from './workorderSvg';

/* eslint-disable @typescript-eslint/no-explicit-any */

const tag = (k: string) => (/^\d/.test(k) ? `P${k}` : k);

/** Svetla varijanta boje (mešanje sa belom) za pozadinu zaglavlja kartice. */
function tint(hex: string, keep = 0.12): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(255 - (255 - c) * keep);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, '0')).join('')}`;
}

const label = (t: string) => ({ text: t, fontSize: 7.5, color: MUTED, bold: true, characterSpacing: 0.5 });
const box = (t: string): any => ({
  columns: [
    { width: 12, canvas: [{ type: 'rect', x: 0, y: 1, w: 9, h: 9, r: 1.5, lineWidth: 0.9, lineColor: '#64748b' }] },
    { width: 'auto', text: t, fontSize: 8.5 },
  ],
  width: 'auto',
  columnGap: 2,
});
const blank = (w = 90) => ({ canvas: [{ type: 'line', x1: 0, y1: 10, x2: w, y2: 10, lineWidth: 0.7, lineColor: '#94a3b8' }] });

/** Radni nalog za majstora koji sklapa ogradu: shema u bojama pozicija, delovi po elementima, stubovi, okovi i kontrolne tačke. */
export async function buildWorkorderPdfBlob(project: Project, customer: Customer | null, materials: Material[], settings: AppSettings): Promise<Blob> {
  const pdfMake = await getPdfMake();
  const wo = buildWorkOrder(project, settings.modelSpecs, materials, cutOptions(settings));
  const colors = positionColors(wo.cutting.positions);
  const logos = await loadHeaderLogos();
  const info = settings.companyInfo ?? {};
  const contact = [info.address, info.phone, info.email, info.pib ? `PIB: ${info.pib}` : ''].filter(Boolean).join('  ·  ');
  const schema = schemaSvg(project, wo.positionOfItem, colors);
  const schemaPng = await svgToPng(schema.svg, schema.width * 2, schema.height * 2);
  const schemaW = 786;
  const schemaH = (schema.height / schema.width) * schemaW;

  const header = docHeader('RADNI NALOG', `Ponuda: ${project.quoteNo || '—'}  ·  ${fmtDate(new Date().toISOString())}`, settings.companyName, contact, logos);
  const stripe: any = { canvas: [{ type: 'rect', x: 0, y: 0, w: 786, h: 3, color: BRAND_RED }], margin: [0, 0, 0, 8] };

  const cell = (l: string, ...v: any[]) => ({ stack: [label(l), ...v] });
  const infoRow: any = {
    table: {
      widths: ['*', '*', 'auto', 110, 110],
      body: [[
        cell('PROJEKAT', { text: project.name || '—', fontSize: 10, bold: true, margin: [0, 1, 0, 0] }),
        cell('KUPAC', { text: customer?.name || '—', fontSize: 10, bold: true, margin: [0, 1, 0, 0] }, { text: [customer?.address, customer?.phone].filter(Boolean).join(' · '), fontSize: 8.5, color: MUTED }),
        cell('STATUS', { text: STATUS_LABELS[project.status], fontSize: 10, bold: true, margin: [0, 1, 0, 0] }),
        cell('ROK ZA ZAVRŠETAK', blank(100)),
        cell('MAJSTOR', blank(100)),
      ]],
    },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => '#f6f4f3', paddingLeft: () => 12, paddingRight: () => 12, paddingTop: () => 8, paddingBottom: () => 8 },
    margin: [0, 0, 0, 8],
  };

  const sm = wo.summary;
  const card = (l: string, v: string, color = INK) => ({ stack: [label(l), { text: v, fontSize: 16, bold: true, color, margin: [0, 2, 0, 0] }] });
  const cards: any = {
    table: {
      widths: ['*', '*', '*', '*', '*'],
      body: [[
        card('UKUPNA DUŽINA', `${fmtNum(sm.occupiedMm / 1000, 2)} m`, BRAND_RED),
        card('ELEMENATA', String(sm.elements)),
        card('KAPIJA', String(sm.gates)),
        card('STUBOVA', String(sm.posts)),
        card('NAJVEĆA VISINA', fmtMm(sm.maxHeightMm)),
      ]],
    },
    layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 0 : 0.6), vLineColor: () => LINE, paddingLeft: () => 12, paddingTop: () => 6, paddingBottom: () => 6 },
    margin: [0, 0, 0, 8],
  };

  const section = (t: string, sub?: string): any => ({ stack: [{ text: t, fontSize: 12, bold: true }, ...(sub ? [{ text: sub, fontSize: 8.5, color: MUTED, margin: [0, 1, 0, 0] }] : [])], margin: [0, 10, 0, 5] });

  const partsTable = (e: WorkElement): any => (e.parts.length
    ? {
        table: {
          widths: ['*', 130, 54, 30],
          body: [
            [label('DEO'), label('PROFIL'), { ...label('DUŽINA'), alignment: 'right' }, { ...label('KOM.'), alignment: 'right' }],
            ...e.parts.map((p) => [
              { text: p.part, fontSize: 9, bold: true },
              { text: p.profile, fontSize: 8.5, color: MUTED },
              { text: p.lengthMm === null ? (p.note ?? '—') : fmtNum(p.lengthMm, 0), fontSize: 9, alignment: 'right' },
              { text: String(p.qty), fontSize: 9, bold: true, alignment: 'right' },
            ]),
          ],
        },
        layout: { hLineColor: () => LINE, hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 0 : 0.4), vLineWidth: () => 0, paddingTop: () => 2.5, paddingBottom: () => 2.5, paddingLeft: () => 0, paddingRight: () => 4 },
      }
    : { text: 'Nema šipkastih delova za sečenje.', fontSize: 9, color: MUTED });

  const factsStack = (e: WorkElement): any => ({
    stack: e.facts.length
      ? e.facts.map((f) => ({ columns: [{ text: f.label, fontSize: 8.5, color: MUTED, width: 92 }, { text: f.value, fontSize: 9, bold: true, width: '*' }], margin: [0, 1.5, 0, 0] }))
      : [{ text: e.detail, fontSize: 8.5, color: MUTED }],
  });

  const cards2: any[] = wo.elements.map((e) => {
    const col = colors.get(e.key) ?? '#475569';
    const checks = [
      'Delovi isečeni po krojnoj listi',
      e.isGate ? 'Kapija sklopljena' : 'Element sklopljen',
      ...(e.isGate ? ['Šarke i brava ugrađene', 'Funkcija proverena'] : []),
      'Mere proverene',
      'Boja bez oštećenja',
    ];
    return {
      unbreakable: true,
      margin: [0, 0, 0, 8],
      table: {
        widths: [500, '*'],
        body: [
          [
            { colSpan: 2, fillColor: tint(col), margin: [8, 3, 8, 3], columns: [
              { width: '*', text: [{ text: `${tag(e.key)}   `, bold: true, color: col, fontSize: 12 }, { text: e.label, bold: true, fontSize: 12 }, { text: `   ${e.detail}`, fontSize: 8.5, color: MUTED }], margin: [0, 2, 0, 0] },
              ...(e.color ? [{ width: 'auto', text: e.color, bold: true, fontSize: 10, color: INK, margin: [0, 3, 0, 0] }] : []),
            ] },
            {},
          ],
          [
            { margin: [8, 4, 6, 4], stack: [partsTable(e)] },
            { margin: [6, 4, 8, 4], stack: [factsStack(e)] },
          ],
          [
            { colSpan: 2, margin: [8, 3, 8, 4], columns: checks.map(box), columnGap: 14 },
            {},
          ],
        ],
      },
      layout: {
        hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 0.8 : 0.4),
        vLineWidth: (i: number) => (i === 0 ? 3 : 0),
        hLineColor: () => LINE,
        vLineColor: () => col,
        paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
      },
    };
  });

  const postsTable: any = wo.posts.length
    ? {
        table: {
          headerRows: 1, dontBreakRows: true,
          widths: [26, '*', 120, 54, 54, 110, 66, 16],
          body: [
            [label('STUB'), label('POLOŽAJ'), label('TIP'), { ...label('PRESEK'), alignment: 'right' }, { ...label('VISINA'), alignment: 'right' }, label('MONTAŽA'), label('BOJA'), { text: '' }],
            ...wo.posts.map((p) => [
              { text: p.name, bold: true, fontSize: 9 },
              { text: p.where, fontSize: 8.5, color: MUTED },
              { text: p.plinthMm ? `${p.type} (podnožje ${p.plinthMm} mm)` : p.type, fontSize: 9 },
              { text: `${p.widthMm} mm`, fontSize: 9, alignment: 'right' },
              { text: `${fmtNum(p.heightMm, 0)} mm`, fontSize: 9, alignment: 'right' },
              { text: p.mounting, fontSize: 8.5 },
              { text: p.color, fontSize: 8.5 },
              { canvas: [{ type: 'rect', x: 0, y: 0, w: 9, h: 9, r: 1.5, lineWidth: 0.9, lineColor: '#64748b' }] },
            ]),
          ],
        },
        layout: { hLineColor: () => LINE, hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 0.6 : 0.4), vLineWidth: () => 0, paddingTop: () => 3, paddingBottom: () => 3 },
      }
    : { text: 'Projekat nema stubova.', color: MUTED };

  const smallTable: any = wo.small.length
    ? {
        table: {
          headerRows: 1, dontBreakRows: true,
          widths: ['*', 60, 40, 16],
          body: [
            [label('STAVKA'), { ...label('KOLIČINA'), alignment: 'right' }, label('JM'), { text: '' }],
            ...wo.small.map((s) => [
              { text: s.name, fontSize: 9 },
              { text: fmtNum(s.qty, s.unit === 'kom' || s.unit === 'set' ? 0 : 2), fontSize: 9, bold: true, alignment: 'right' },
              { text: s.unit, fontSize: 8.5, color: MUTED },
              { canvas: [{ type: 'rect', x: 0, y: 0, w: 9, h: 9, r: 1.5, lineWidth: 0.9, lineColor: '#64748b' }] },
            ]),
          ],
        },
        layout: { hLineColor: () => LINE, hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 0.6 : 0.4), vLineWidth: () => 0, paddingTop: () => 3, paddingBottom: () => 3 },
      }
    : { text: 'Nema okova ni sitnog materijala u obračunu.', color: MUTED };

  const sign = (t: string): any => ({ stack: [blank(170), { text: t, fontSize: 8.5, color: MUTED, margin: [0, 2, 0, 0] }], width: 'auto' });

  const def: any = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [28, 26, 28, 38],
    defaultStyle: { font: 'Roboto', fontSize: 9.5, color: INK },
    info: { title: `Radni nalog — ${project.name}`, author: settings.companyName },
    footer: (page: number, pages: number) => ({
      columns: [
        { text: `${settings.companyName}  ·  Radni nalog  ·  ${project.name}`, fontSize: 8, color: MUTED },
        { text: `Strana ${page} od ${pages}`, alignment: 'right', fontSize: 8, color: MUTED },
      ],
      margin: [28, 12, 28, 0],
    }),
    content: [
      header,
      stripe,
      infoRow,
      cards,
      { image: schemaPng, width: schemaW, height: schemaH, margin: [0, 0, 0, 2] },
      { text: 'Boja i oznaka P1, P2… su iste kao na krojnoj listi: isečene komade razvrstaj po bojama pre sklapanja. S1, S2… su stubovi.', fontSize: 8.5, color: MUTED },
      ...(cards2.length
        ? [{ unbreakable: true, stack: [section('Elementi za sklapanje', 'Za svaki element: delovi sa dužinama i brojem komada, podaci i kontrolne tačke (čekiraj kad je gotovo).'), cards2[0]] }, ...cards2.slice(1)]
        : [section('Elementi za sklapanje'), { text: 'Projekat nema elemenata za sklapanje.', color: MUTED }]),
      section('Stubovi'),
      postsTable,
      section('Okovi i sitan materijal', 'Ukupno za projekat, bez rezerve.'),
      smallTable,
      {
        margin: [0, 12, 0, 0],
        unbreakable: true,
        stack: [
          { text: 'Napomene', fontSize: 10, bold: true, margin: [0, 0, 0, 3] },
          ...(project.notes ? [{ text: project.notes, fontSize: 9, margin: [0, 0, 0, 4] }] : []),
          { ul: ['Mere su u mm. Delove seći prema krojnoj listi; pre sklapanja proveriti dužine i boju.', 'Sva odstupanja od naloga (mere, boja, materijal) upisati ovde i javiti pre nastavka rada.'], fontSize: 8.5, color: MUTED },
          { canvas: [{ type: 'line', x1: 0, y1: 14, x2: 786, y2: 14, lineWidth: 0.6, lineColor: '#94a3b8' }, { type: 'line', x1: 0, y1: 30, x2: 786, y2: 30, lineWidth: 0.6, lineColor: '#94a3b8' }], margin: [0, 2, 0, 0] },
          { columns: [sign('Nalog izdao'), sign('Majstor (preuzeo)'), sign('Kontrolu izvršio'), sign('Datum završetka')], columnGap: 20, margin: [0, 16, 0, 0] },
        ],
      },
    ],
  };
  return renderBlob(pdfMake, def);
}

export async function downloadWorkorderPdf(project: Project, customer: Customer | null, materials: Material[], settings: AppSettings): Promise<void> {
  downloadBlob(await buildWorkorderPdfBlob(project, customer, materials, settings), `radni-nalog_${safeFilename(project.name)}.pdf`);
}
