import { gateLeafPoses } from '../domain/geometry/gates';
import { createElement } from 'react';
import { SketchSvg } from '../components/designer/Sketch';
import { CUSTOM_KIND_LABELS, type CustomModel } from '../domain/models/custom';
import { customModelOf, scaledModel } from '../domain/models/customRegistry';
import { builtinToCustom } from '../domain/models/fromBuiltin';
import type { AppSettings, Customer, FenceModelId, Material, Project } from '../domain/models/types';
import { leafHeightOf, slidingH } from '../domain/gates/slidingLayout';
import { computeLayout } from '../domain/geometry/layout';
import { buildSketch } from '../domain/models/sketch';
import { resolveSliding } from '../domain/gates/slidingAssembly';
import { inPrintScope, PRINT_SCOPE_LABELS, type PrintScope } from '../domain/pricing/cutting';
import { itemLabel } from '../utils/labels';
import { fmtDate } from '../utils/units';
import { downloadBlob, safeFilename } from './exports';
import { getPdfMake, renderBlob } from './pdf';
import { docHeader, INK, MUTED, svgToPng } from './pdfCutlist';
import { loadHeaderLogos } from './pdfHeader';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** SVG tekst skice (samostalan fajl, sa veličinom iz viewBox-a). */
export async function sketchSvgString(model: CustomModel, materials: Material[], bare = false, tint?: string): Promise<{ svg: string; width: number; height: number }> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const svg = renderToStaticMarkup(createElement(SketchSvg, { model, materials, bare, tint }));
  const m = /viewBox="([-\d.e]+) ([-\d.e]+) ([-\d.e]+) ([-\d.e]+)"/.exec(svg);
  if (!m) throw new Error('Skica nije mogla da se napravi.');
  return { svg: `<?xml version="1.0" encoding="UTF-8"?>${svg}`, width: Number(m[3]), height: Number(m[4]) };
}

/** PDF skice sa kotama za majstora: crtež, tabela delova i presek prečke u U profilu na jednoj strani (A4, položeno ili uspravno prema obliku). */
export async function buildSketchPdfBlob(model: CustomModel, materials: Material[], settings: AppSettings): Promise<Blob> {
  const pdfMake = await getPdfMake();
  const { svg, width, height } = await sketchSvgString(model, materials);
  const landscape = width > height * 1.1;
  const px = Math.min(3200, Math.round(width * Math.min(3, 3200 / width)));
  const py = Math.round((px * height) / width);
  const png = await svgToPng(svg, px, Math.min(py, 4600));
  const pageW = landscape ? 842 : 595; const pageH = landscape ? 595 : 842;
  const availW = pageW - 56; const availH = pageH - 26 - 38 - 78;
  const imgW = Math.min(availW, (availH * width) / height);
  const logos = await loadHeaderLogos();
  const info = settings.companyInfo ?? {};
  const contact = [info.address, info.phone, info.email, info.pib ? `PIB: ${info.pib}` : ''].filter(Boolean).join('  ·  ');
  const def: any = {
    pageSize: 'A4',
    pageOrientation: landscape ? 'landscape' : 'portrait',
    pageMargins: [28, 26, 28, 38],
    defaultStyle: { font: 'Roboto', fontSize: 9.5, color: INK },
    info: { title: `Skica — ${model.name}`, author: settings.companyName },
    footer: () => ({ text: `${settings.companyName}  ·  Skica sa kotama  ·  ${model.name}  ·  ${CUSTOM_KIND_LABELS[model.kind]} ${model.widthMm} × ${model.heightMm} mm`, fontSize: 8, color: MUTED, margin: [28, 12, 28, 0] }),
    content: [
      docHeader('SKICA', `${model.name || 'Model'}  ·  ${fmtDate(new Date().toISOString())}`, settings.companyName, contact, logos),
      { image: png, width: imgW, alignment: 'center', margin: [0, 10, 0, 0] },
    ],
  };
  return renderBlob(pdfMake, def);
}

export async function downloadSketchPdf(model: CustomModel, materials: Material[], settings: AppSettings): Promise<void> {
  downloadBlob(await buildSketchPdfBlob(model, materials, settings), `skica_${safeFilename(model.name)}.pdf`);
}

export async function downloadSketchSvg(model: CustomModel, materials: Material[]): Promise<void> {
  const { svg } = await sketchSvgString(model, materials);
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `skica_${safeFilename(model.name)}.svg`);
}

/**
 * Model (nacrtani ili iz kataloga) razvučen na meru elementa projekta: polje ograde ili krilo kapije; null kad element nema crtež
 * (otvor, klizna kapija bez nacrtanog krila). Klizna kapija sa nacrtanim krilom: širina i visina krila iz sklopa.
 */
export function elementModel(project: Project, idx: number, materials: Material[], layout = computeLayout(project)): CustomModel | null {
  const it = project.items[idx];
  if (!it || it.kind === 'opening') return null;
  try {
    if (it.kind === 'fence') {
      const src = customModelOf(it.modelId);
      const model = src ? scaledModel(src, it.widthMm, it.heightMm, it.params.slats) : builtinToCustom(it.modelId as FenceModelId, materials, `sk_${idx}`, it.widthMm, it.heightMm);
      return { ...model, name: src?.name ?? model.name };
    }
    const li = layout.items[idx];
    if (!it.infillModelId || !li) return null;
    let w = Math.round(li.clearWidth); let h = Math.round(leafHeightOf(it));
    // dvokrilna kapija: sklopni crtež je jedno krilo (levo), a oba krila su ista vrsta
    if (it.gateType === 'double') w = Math.round(gateLeafPoses(it, li.clearStart, li.clearEnd, 0)[0]?.widthMm ?? w);
    if (it.sliding) {
      if (!it.sliding.drawnLeaf) return null;
      const res = resolveSliding(it.sliding, li.clearWidth, slidingH(it));
      w = Math.round(res.W); h = Math.round(res.frameHeight);
    }
    const src = customModelOf(it.infillModelId);
    const model = src ? scaledModel(src, w, h, it.params.slats) : builtinToCustom(it.infillModelId as FenceModelId, materials, `skg_${idx}`, w, h);
    return { ...model, name: src?.name ?? model.name, widthMm: w, heightMm: h };
  } catch { return null; }
}

const LBL = (t: string, extra: any = {}): any => ({ text: t, fontSize: 7.5, color: MUTED, bold: true, characterSpacing: 0.5, ...extra });
const TABLE_LAYOUT = { hLineColor: () => '#e2e8f0', hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 0 : 0.4), vLineWidth: () => 0, paddingTop: () => 2.5, paddingBottom: () => 2.5, paddingLeft: () => 3, paddingRight: () => 3 };

/**
 * Sklopni crtež elementa za radni nalog: delovi u boji elementa sa brojevima pozicija (bez mera) i tabela šta je koji broj
 * (naziv, presek, dužina i uglovi, komada). Za kapiju se ispod tabele ispisuje i okov kapije.
 */
export async function elementAssembly(project: Project, idx: number, materials: Material[], color: string): Promise<{ png: string; width: number; height: number; legend: any; legendH: number } | null> {
  const model = elementModel(project, idx, materials);
  const it = project.items[idx];
  if (!model || !it) return null;
  const { svg, width, height } = await sketchSvgString(model, materials, true, color);
  const px = Math.min(2600, Math.round(width * Math.min(3, 2600 / width)));
  const png = await svgToPng(svg, px, Math.min(Math.round((px * height) / width), 3600));
  const sk = buildSketch(model, materials);
  const table: any = {
    table: {
      headerRows: 1, dontBreakRows: true, widths: [14, '*', 34, 38, 18],
      body: [
        [LBL('BR.'), LBL('DEO'), LBL('PRESEK'), LBL('DUŽINA', { alignment: 'right' }), LBL('KOM.', { alignment: 'right' })],
        ...sk.positions.map((p) => [
          { text: String(p.no), bold: true, fontSize: 9, color },
          { stack: [{ text: p.name, fontSize: 8, bold: true }, ...(p.angle !== '—' ? [{ text: p.angle, fontSize: 7.5, color: MUTED }] : [])] },
          { text: p.section, fontSize: 8 },
          { text: p.length, fontSize: 8, alignment: 'right' },
          { text: String(p.count), fontSize: 8.5, bold: true, alignment: 'right' },
        ]),
      ],
    },
    layout: TABLE_LAYOUT,
  };
  const hw = it.kind === 'gate' ? (it.design?.hardware ?? []) : [];
  const hwTable: any = hw.length ? {
    margin: [0, 8, 0, 0],
    table: { headerRows: 1, dontBreakRows: true, widths: ['*', 20], body: [[LBL('OKOV'), LBL('KOM.', { alignment: 'right' })], ...hw.map((x) => [{ text: `${x.name}${x.code ? ` (${x.code})` : ''}`, fontSize: 8 }, { text: String(x.qty), fontSize: 8.5, bold: true, alignment: 'right' }])] },
    layout: TABLE_LAYOUT,
  } : null;
  // visina legende (pt): zaglavlje + redovi (red sa uglom ima dve linije); crtež se uklapa u ostatak stranice
  const legendH = 16 + sk.positions.reduce((n, p) => n + (p.angle !== '—' ? 24 : 15), 0) + (hw.length ? 24 + hw.length * 15 : 0);
  return { png, width, height, legend: { stack: [table, ...(hwTable ? [hwTable] : [])] }, legendH };
}

/**
 * Skica za ceo projekat (ceo projekat, samo kapije ili samo ograda): samo skice nacrtanih modela sa kotama — za svaki element ograde
 * i krilo kapije mere, tabela delova, presek prečke i kote zavarivanja. Isti elementi ograde (model i mera) se crtaju jednom.
 */
export interface SketchPage { title: string; png: string; width: number; height: number }

export async function projectSketchPages(project: Project, materials: Material[], scope: PrintScope = 'all'): Promise<SketchPage[]> {
  const pages: SketchPage[] = [];
  const layout = computeLayout(project);
  const seen = new Map<string, { idx: number[]; model: CustomModel; at: number }>();
  const list: { idx: number[]; model: CustomModel; label?: string }[] = [];
  project.items.forEach((it, i) => {
    if (!inPrintScope(it, scope) || it.kind === 'opening') return;
    const model = elementModel(project, i, materials, layout);
    if (!model) return;
    if (it.kind === 'fence') {
      const key = `${it.modelId}|${it.widthMm}|${it.heightMm}`;
      const ex = seen.get(key);
      if (ex) { ex.idx.push(i + 1); return; }
      const entry = { idx: [i + 1], model, at: list.length };
      seen.set(key, entry); list.push(entry);
    } else list.push({ idx: [i + 1], model, label: itemLabel(project.items, i) });
  });
  for (const e of list) {
    const title = e.label
      ? `${e.label} — ${e.model.name || 'Model'}  ·  kapija ${e.model.widthMm} × ${e.model.heightMm} mm`
      : `Element ${e.idx.join(', ')}${e.idx.length > 1 ? ` (${e.idx.length} kom)` : ''} — ${e.model.name || 'Model'}  ·  ${e.model.widthMm} × ${e.model.heightMm} mm`;
    const { svg, width, height } = await sketchSvgString(e.model, materials);
    const px = Math.min(3200, Math.round(width * Math.min(3, 3200 / width)));
    pages.push({ title, png: await svgToPng(svg, px, Math.min(Math.round((px * height) / width), 4600)), width, height });
  }
  return pages;
}

export async function buildProjectSketchPdfBlob(project: Project, customer: Customer | null, materials: Material[], settings: AppSettings, scope: PrintScope = 'all'): Promise<Blob> {
  const pdfMake = await getPdfMake();
  const sketches = await projectSketchPages(project, materials, scope);
  const logos = await loadHeaderLogos();
  const info = settings.companyInfo ?? {};
  const contact = [info.address, info.phone, info.email, info.pib ? `PIB: ${info.pib}` : ''].filter(Boolean).join('  ·  ');
  const part = scope === 'all' ? '' : ` — ${PRINT_SCOPE_LABELS[scope].toLowerCase()}`;
  const pages: any[] = [];
  let firstLandscape = false;
  sketches.forEach((sk, i) => {
    const landscape = sk.width > sk.height * 1.1;
    if (i === 0) firstLandscape = landscape;
    const pageW = landscape ? 842 : 595; const pageH = landscape ? 595 : 842;
    const availW = pageW - 56; const availH = pageH - 26 - 38 - (i === 0 ? 112 : 40);
    const imgW = Math.min(availW, (availH * sk.width) / sk.height);
    pages.push(
      { text: sk.title, bold: true, fontSize: 11, margin: [0, i === 0 ? 8 : 0, 0, 4], ...(i > 0 ? { pageBreak: 'before', pageOrientation: landscape ? 'landscape' : 'portrait' } : {}) },
      { image: sk.png, width: imgW, alignment: 'center' },
    );
  });
  const def: any = {
    pageSize: 'A4', pageOrientation: firstLandscape ? 'landscape' : 'portrait', pageMargins: [28, 26, 28, 38],
    defaultStyle: { font: 'Roboto', fontSize: 9.5, color: INK },
    info: { title: `Skica${part} — ${project.name}`, author: settings.companyName },
    footer: () => ({ text: `${settings.companyName}  ·  Skica${part}  ·  ${project.name}`, fontSize: 8, color: MUTED, margin: [28, 12, 28, 0] }),
    content: [
      docHeader(`SKICA${part.toUpperCase()}`, `${project.name}${customer ? `  ·  ${customer.name}` : ''}  ·  ${fmtDate(new Date().toISOString())}`, settings.companyName, contact, logos),
      ...(pages.length ? pages : [{ text: 'Nema elemenata za crtež u izabranom delu projekta.', color: MUTED, margin: [0, 12, 0, 0] }]),
    ],
  };
  return renderBlob(pdfMake, def);
}
