import { STATUS_LABELS } from '../domain/models/catalog';
import { buildCuttingList, cutOptions, groupBars, type CuttingList } from '../domain/pricing/cutting';
import type { AppSettings, Customer, Material, Project } from '../domain/models/types';
import { fmtDate, fmtNum } from '../utils/units';
import { barSvg, positionColors } from './cutlistSvg';
import { downloadBlob, safeFilename } from './exports';
import { getPdfMake, renderBlob } from './pdf';
import { AMBER, BRAND_DARK, BRAND_RED, docHeader, loadHeaderLogos, toDataUrl } from './pdfHeader';

export { AMBER, BRAND_DARK, BRAND_RED, docHeader, toDataUrl };

/* eslint-disable @typescript-eslint/no-explicit-any */
export const INK = '#1a1a1a';
export const MUTED = '#64748b';
export const LINE = '#e2e8f0';

export async function svgToPng(svg: string, w: number, h: number): Promise<string> {
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Crtež šipke nije moguće pretvoriti u sliku.')); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; });
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/png');
}

export const fmtMm = (v: number) => `${fmtNum(v, 0)} mm`;
export const effColor = (pct: number) => (pct >= 85 ? '#15803d' : pct >= 65 ? '#b45309' : BRAND_RED);

/** Krojna lista za sve šipkaste profile projekta: raspored komada na šipke, ostatak, pozicije u boji. */
export async function buildCutlistPdfBlob(project: Project, customer: Customer | null, materials: Material[], settings: AppSettings, list?: CuttingList): Promise<Blob> {
  const pdfMake = await getPdfMake();
  const cl = list ?? buildCuttingList(project, settings.modelSpecs, materials, cutOptions(settings));
  const colors = positionColors(cl.positions);
  const logos = await loadHeaderLogos();
  const info = settings.companyInfo ?? {};
  const contact = [info.address, info.phone, info.email, info.pib ? `PIB: ${info.pib}` : ''].filter(Boolean).join('  ·  ');

  // crteži šipki (jedna slika po šipki)
  let uid = 0;
  const barImages = new Map<string, string>();
  for (const p of cl.profiles) {
    for (const g of groupBars(p.bars)) barImages.set(`${p.profile}|${g.from}`, await svgToPng(barSvg(g.bar, cl.stockMm, cl.kerfMm, colors, String(uid++)), 2000, 104));
  }

  const card = (label: string, value: string, color = INK) => ({
    stack: [{ text: label, fontSize: 7.5, color: MUTED, bold: true, characterSpacing: 0.5 }, { text: value, fontSize: 16, bold: true, color, margin: [0, 2, 0, 0] }],
  });
  const infoCell = (label: string, value: string) => ({ stack: [{ text: label, fontSize: 7.5, color: MUTED, bold: true, characterSpacing: 0.5 }, { text: value || '—', fontSize: 10, bold: true, margin: [0, 1, 0, 0] }] });

  const header: any = docHeader('KROJNA LISTA', `Ponuda: ${project.quoteNo || '—'}  ·  ${fmtDate(new Date().toISOString())}`, settings.companyName, contact, logos);
  const stripe: any = { canvas: [{ type: 'rect', x: 0, y: 0, w: 786, h: 3, color: BRAND_RED }], margin: [0, 0, 0, 8] };

  const infoRow: any = {
    table: {
      widths: ['*', '*', 'auto', 'auto', 'auto'],
      body: [[
        infoCell('PROJEKAT', project.name),
        infoCell('KUPAC', customer ? [customer.name, customer.address].filter(Boolean).join(', ') : ''),
        infoCell('STATUS', STATUS_LABELS[project.status]),
        infoCell('ŠIPKA', fmtMm(cl.stockMm)),
        infoCell('TESTERA', fmtMm(cl.kerfMm)),
      ]],
    },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => '#f6f4f3', paddingLeft: () => 12, paddingRight: () => 12, paddingTop: () => 8, paddingBottom: () => 8 },
    margin: [0, 0, 0, 8],
  };

  const t = cl.totals;
  const cards: any = {
    table: {
      widths: ['*', '*', '*', '*', '*'],
      body: [[
        card('VRSTA PROFILA', String(t.profiles)),
        card('ŠIPKI ZA NABAVKU', String(t.bars), BRAND_RED),
        card('KOMADA ZA SEČENJE', String(t.pieces)),
        card('ISKORIŠĆENJE', `${fmtNum(t.efficiencyPct, 1)} %`, effColor(t.efficiencyPct)),
        card('UKUPAN OSTATAK', `${fmtNum(t.leftoverMm / 1000, 2)} m`),
      ]],
    },
    layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 0 : 0.6), vLineColor: () => LINE, fillColor: () => '#ffffff', paddingLeft: () => 12, paddingTop: () => 6, paddingBottom: () => 6, hLineColor: () => LINE },
    margin: [0, 0, 0, 10],
  };

  const legend: any = cl.positions.length
    ? {
        table: {
          widths: [14, 34, 150, '*'],
          body: [
            [{ text: '', border: [false, false, false, true] }, { text: 'POZ.', fontSize: 7.5, bold: true, color: MUTED, border: [false, false, false, true] }, { text: 'ELEMENT', fontSize: 7.5, bold: true, color: MUTED, border: [false, false, false, true] }, { text: 'OPIS', fontSize: 7.5, bold: true, color: MUTED, border: [false, false, false, true] }],
            ...cl.positions.map((p) => [
              { canvas: [{ type: 'rect', x: 0, y: 1, w: 11, h: 11, r: 3, color: colors.get(p.key) }], border: [false, false, false, true] },
              { text: /^\d/.test(p.key) ? `P${p.key}` : p.key, bold: true, fontSize: 9, color: colors.get(p.key), border: [false, false, false, true] },
              { text: p.label, fontSize: 9, bold: true, border: [false, false, false, true] },
              { text: p.detail, fontSize: 8.5, color: MUTED, border: [false, false, false, true] },
            ]),
          ],
        },
        layout: { hLineColor: () => LINE, hLineWidth: () => 0.5, vLineWidth: () => 0, paddingTop: () => 3, paddingBottom: () => 3 },
        margin: [0, 0, 0, 6],
      }
    : { text: 'Projekat nema šipkastih profila za sečenje.', color: MUTED, margin: [0, 8, 0, 0] };

  const sections: any[] = cl.profiles.map((p) => {
    const rows: any[] = [
      [
        { colSpan: 3, fillColor: '#f6f4f3', margin: [6, 0, 6, 0], columns: [
          { stack: [{ text: p.profile, fontSize: 11.5, bold: true }, { text: `${p.pieceCount} komada · ${fmtNum(p.pieceTotalMm / 1000, 2)} m`, fontSize: 8.5, color: MUTED }], width: '*' },
          { text: [{ text: `${p.newBars} ${p.newBars === 1 ? 'šipka' : 'šipke'}${p.offcutBars ? ` + ${p.offcutBars} ostat.` : ''}`, bold: true, color: BRAND_RED }, { text: `   ·   iskorišćenje ` , color: MUTED }, { text: `${fmtNum(p.efficiencyPct, 1)} %`, bold: true, color: effColor(p.efficiencyPct) }], alignment: 'right', fontSize: 10, margin: [0, 5, 0, 0], width: 'auto' },
        ] },
        {}, {},
      ],
      ...groupBars(p.bars).map((g) => [
        { stack: [{ text: g.bar.offcut ? `Ostatak ${fmtNum(g.bar.stockMm ?? 0, 0)}` : g.count > 1 ? `Šipke ${g.from}–${g.to}` : `Šipka ${g.from}`, fontSize: 8.5, bold: true, color: g.bar.offcut ? '#b45309' : INK }, ...(g.count > 1 ? [{ text: `× ${g.count}`, fontSize: 11, bold: true, color: BRAND_RED }] : [])], margin: [0, g.count > 1 ? 3 : 9, 0, 0] },
        { image: barImages.get(`${p.profile}|${g.from}`)!, width: 640 },
        { text: [{ text: 'Ostatak\n', fontSize: 7, color: MUTED }, { text: fmtMm(g.bar.leftoverMm), fontSize: 9, bold: true, color: g.bar.leftoverMm === 0 ? '#15803d' : INK }], alignment: 'right', margin: [0, 3, 0, 0] },
      ]),
    ];
    const summary: any = {
      table: {
        widths: [70, 40, '*'],
        body: [
          [{ text: 'DUŽINA', fontSize: 7.5, bold: true, color: MUTED }, { text: 'KOM.', fontSize: 7.5, bold: true, color: MUTED, alignment: 'right' }, { text: 'POZICIJE', fontSize: 7.5, bold: true, color: MUTED }],
          ...p.summary.map((s) => [{ text: s.miter ? `${fmtMm(s.lengthMm)}  (45°)` : fmtMm(s.lengthMm), fontSize: 9 }, { text: String(s.qty), fontSize: 9, bold: true, alignment: 'right' }, { text: s.positions.map((k) => (/^\d/.test(k) ? `P${k}` : k)).join(', '), fontSize: 8.5, color: MUTED }]),
        ],
      },
      layout: { hLineColor: () => LINE, hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 0 : 0.4), vLineWidth: () => 0, paddingTop: () => 2, paddingBottom: () => 2 },
      margin: [0, 6, 0, 0],
      unbreakable: true,
    };
    return {
      margin: [0, 10, 0, 0],
      stack: [
        {
          table: { headerRows: 1, dontBreakRows: true, widths: [56, 640, 90], body: rows },
          layout: { hLineWidth: (i: number, node: any) => (i === 0 ? 0 : i === 1 ? 0 : i === node.table.body.length ? 0.6 : 0.4), vLineWidth: () => 0, hLineColor: () => LINE, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 3, paddingBottom: () => 3 },
        },
        ...(p.oversize.length ? [{ text: `Upozorenje: ${p.oversize.length} kom duži od šipke (${fmtMm(Math.max(...p.oversize.map((o) => o.lengthMm)))}) nije raspoređeno.`, color: BRAND_RED, bold: true, fontSize: 9, margin: [0, 4, 0, 0] }] : []),
        summary,
      ],
    };
  });

  const def: any = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [28, 26, 28, 38],
    defaultStyle: { font: 'Roboto', fontSize: 9.5, color: INK },
    info: { title: `Krojna lista — ${project.name}`, author: settings.companyName },
    footer: (page: number, pages: number) => ({
      columns: [
        { text: `${settings.companyName}  ·  Krojna lista  ·  ${project.name}`, fontSize: 8, color: MUTED },
        { text: `Strana ${page} od ${pages}`, alignment: 'right', fontSize: 8, color: MUTED },
      ],
      margin: [28, 12, 28, 0],
    }),
    content: [
      header,
      stripe,
      infoRow,
      cards,
      { text: 'Pozicije', fontSize: 11.5, bold: true, margin: [0, 2, 0, 4] },
      legend,
      ...sections,
      {
        margin: [0, 12, 0, 0],
        unbreakable: true,
        stack: [
          { text: 'Napomene', fontSize: 10, bold: true, margin: [0, 0, 0, 3] },
          { ul: [...cl.notes, 'Boja i oznaka P# na komadu je pozicija (element) iz projekta; razmak između komada je rez testere.', ...(project.notes ? [`Napomena projekta: ${project.notes}`] : [])], fontSize: 8.5, color: MUTED },
          { columns: [{ text: 'Sečenje izvršio: ________________', fontSize: 9, margin: [0, 18, 0, 0] }, { text: 'Kontrolisao: ________________', fontSize: 9, alignment: 'right', margin: [0, 18, 0, 0] }] },
        ],
      },
    ],
  };
  return renderBlob(pdfMake, def);
}

export async function downloadCutlistPdf(project: Project, customer: Customer | null, materials: Material[], settings: AppSettings): Promise<void> {
  downloadBlob(await buildCutlistPdfBlob(project, customer, materials, settings), `krojna-lista_${safeFilename(project.name)}.pdf`);
}
