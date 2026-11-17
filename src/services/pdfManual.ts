import { MANUAL, MANUAL_DATE, MANUAL_SUBTITLE, MANUAL_TITLE, manualRuns, type ManualBlock } from '../data/userManual';
import type { AppSettings } from '../domain/models/types';
import { downloadBlob } from './exports';
import { getPdfMake, renderBlob } from './pdf';
import { BRAND_DARK, BRAND_RED, loadHeaderLogos } from './pdfHeader';

/* eslint-disable @typescript-eslint/no-explicit-any */
const INK = '#1a1a1a';
const MUTED = '#64748b';

const runs = (text: string, extra: object = {}): any => ({ text: manualRuns(text).map((r) => (r.bold ? { text: r.text, bold: true } : r.text)), ...extra });

function block(b: ManualBlock): any {
  if ('p' in b) return runs(b.p, { margin: [0, 0, 0, 6], lineHeight: 1.25 });
  if ('steps' in b) return { ol: b.steps.map((s) => runs(s, { margin: [0, 0, 0, 3], lineHeight: 1.2 })), margin: [6, 0, 0, 6] };
  if ('list' in b) return { ul: b.list.map((s) => runs(s, { margin: [0, 0, 0, 3], lineHeight: 1.2 })), margin: [6, 0, 0, 6] };
  const tip = 'tip' in b;
  return {
    table: { widths: ['*'], body: [[runs(`${tip ? 'Savet: ' : 'Važno: '}${tip ? b.tip : b.warn}`, { fontSize: 9.5, color: tip ? '#0f5132' : '#7a2e0e', lineHeight: 1.2 })]] },
    layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 3 : 0), vLineColor: () => (tip ? '#16a34a' : '#ea580c'), fillColor: () => (tip ? '#ecfdf3' : '#fff7ed'), paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 5, paddingBottom: () => 5 },
    margin: [0, 2, 0, 8],
  };
}

/** Uputstvo za upotrebu kao PDF: naslovna strana, sadržaj sa brojevima strana i poglavlja (isti tekst kao pregled na stranici Pomoć). */
export async function buildManualPdfBlob(settings: AppSettings): Promise<Blob> {
  const pdfMake = await getPdfMake();
  const logos = await loadHeaderLogos().catch(() => null);
  const content: any[] = [
    // naslovna strana
    { canvas: [{ type: 'rect', x: -40, y: -40, w: 595, h: 300, color: BRAND_DARK }] },
    ...(logos ? [{ columns: [{ image: logos.mark, width: 70 }, { image: logos.wide, width: 190, margin: [14, 18, 0, 0] }], absolutePosition: { x: 40, y: 60 } }] : []),
    { text: MANUAL_TITLE.toUpperCase(), fontSize: 30, bold: true, color: '#ffc247', absolutePosition: { x: 40, y: 170 } },
    { text: MANUAL_SUBTITLE, fontSize: 13, color: '#ffffff', absolutePosition: { x: 40, y: 212 } },
    { text: '', margin: [0, 290, 0, 0] },
    { text: settings.companyName, fontSize: 16, bold: true },
    { text: [settings.companyInfo?.address, settings.companyInfo?.phone, settings.companyInfo?.email].filter(Boolean).join('  ·  '), color: MUTED, margin: [0, 4, 0, 0] },
    { text: `Izdanje: ${MANUAL_DATE}`, color: MUTED, margin: [0, 18, 0, 0] },
    { text: 'Uputstvo opisuje rad u aplikaciji korak po korak: prijavu, projekte, crtanje ograde i kapija, modele, cene, magacin i dokumente za radionicu. Na kraju su prečice i česta pitanja.', margin: [0, 18, 0, 0], lineHeight: 1.3 },
    // sadržaj
    { toc: { title: { text: 'Sadržaj', fontSize: 20, bold: true, color: BRAND_DARK, margin: [0, 0, 0, 12] }, numberStyle: { color: MUTED } }, pageBreak: 'before' },
  ];
  MANUAL.forEach((ch, i) => {
    content.push({ text: `${i + 1}. ${ch.title}`, style: 'h1', tocItem: true, tocStyle: { bold: true }, tocMargin: [0, 4, 0, 0], pageBreak: 'before' });
    content.push({ canvas: [{ type: 'rect', x: 0, y: 0, w: 515, h: 2.5, color: BRAND_RED }], margin: [0, 0, 0, 10] });
    if (ch.intro) content.push(runs(ch.intro, { italics: true, color: '#334155', margin: [0, 0, 0, 10], lineHeight: 1.3 }));
    ch.sections.forEach((sec, j) => {
      content.push({ text: `${i + 1}.${j + 1} ${sec.title}`, style: 'h2', tocItem: true, tocMargin: [14, 2, 0, 0], tocStyle: { color: '#334155' } });
      for (const b of sec.blocks) content.push(block(b));
    });
  });
  const def: any = {
    pageSize: 'A4',
    pageMargins: [40, 46, 40, 50],
    defaultStyle: { font: 'Roboto', fontSize: 10.5, color: INK },
    info: { title: `${MANUAL_TITLE} — ${settings.companyName}`, author: settings.companyName },
    header: (page: number) => (page <= 1 ? null : { text: `${MANUAL_TITLE} · ${settings.companyName}`, fontSize: 8, color: MUTED, margin: [40, 20, 40, 0] }),
    footer: (page: number, pages: number) => (page <= 1 ? null : { text: `Strana ${page} od ${pages}`, alignment: 'right', fontSize: 8, color: MUTED, margin: [40, 16, 40, 0] }),
    content,
    styles: {
      h1: { fontSize: 19, bold: true, color: BRAND_DARK, margin: [0, 0, 0, 6] },
      h2: { fontSize: 13, bold: true, color: INK, margin: [0, 8, 0, 5] },
    },
  };
  return renderBlob(pdfMake, def);
}

export async function downloadManualPdf(settings: AppSettings): Promise<void> {
  downloadBlob(await buildManualPdfBlob(settings), 'uputstvo-za-upotrebu-ograde.pdf');
}
