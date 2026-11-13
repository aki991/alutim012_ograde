import { createElement } from 'react';
import { SketchSvg } from '../components/designer/Sketch';
import { CUSTOM_KIND_LABELS, type CustomModel } from '../domain/models/custom';
import type { AppSettings, Material } from '../domain/models/types';
import { fmtDate } from '../utils/units';
import { downloadBlob, safeFilename } from './exports';
import { getPdfMake, renderBlob } from './pdf';
import { docHeader, INK, MUTED, svgToPng } from './pdfCutlist';
import { loadHeaderLogos } from './pdfHeader';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** SVG tekst skice (samostalan fajl, sa veličinom iz viewBox-a). */
export async function sketchSvgString(model: CustomModel, materials: Material[]): Promise<{ svg: string; width: number; height: number }> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const svg = renderToStaticMarkup(createElement(SketchSvg, { model, materials }));
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
