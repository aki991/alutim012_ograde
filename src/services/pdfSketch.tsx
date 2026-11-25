import { gateLeafPoses } from '../domain/geometry/gates';
import { itemSlope } from '../domain/geometry/stair';
import { developStairSketch } from '../domain/models/stairSketch';
import { createElement } from 'react';
import { SketchSvg } from '../components/designer/Sketch';
import { CUSTOM_KIND_LABELS, partBounds, type CustomModel } from '../domain/models/custom';
import { materialShape } from '../domain/models/materialShape';
import { customLiftOf, customModelOf, scaledWithReinforce } from '../domain/models/customRegistry';
import { builtinToCustom } from '../domain/models/fromBuiltin';
import type { AppSettings, Customer, FenceModelId, Material, Project } from '../domain/models/types';
import { leafHeightOf, slidingH } from '../domain/gates/slidingLayout';
import { computeLayout } from '../domain/geometry/layout';
import { buildSketch, type ChainDim } from '../domain/models/sketch';
import { isFramePart } from '../domain/models/frame';
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
export async function sketchSvgString(model: CustomModel, materials: Material[], bare = false, tint?: string, step?: { hide?: string[]; mute?: string[]; title?: string; chains?: { left?: ChainDim[]; bottom?: ChainDim[] } }): Promise<{ svg: string; width: number; height: number }> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const svg = renderToStaticMarkup(createElement(SketchSvg, { model, materials, bare, tint, ...step }));
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
    const li = layout.items[idx];
    if (it.kind === 'fence') {
      // polje je svetli otvor između stubova (kao na crtežu i u krojnoj listi), ne mera osa–osa stubova
      const w = Math.round(li?.clearWidth ?? it.widthMm);
      const src = customModelOf(it.modelId);
      const slope = itemSlope(li);
      const lift = src ? Math.min(Math.max(0, it.params.liftMm ?? customLiftOf(it.modelId)), Math.max(0, it.heightMm - 100)) : 0;
      const slats = { ...it.params.slats, stairTan: slope.tan || undefined, ...(src?.terraceSourceId && lift ? { infillLiftMm: lift } : {}) };
      const model = src ? scaledWithReinforce(src, w, it.heightMm - lift, slats) : builtinToCustom(it.modelId as FenceModelId, materials, `sk_${idx}`, w, it.heightMm, { miterFrame: true });
      const developed = developStairSketch({ ...model, name: src?.name ?? model.name }, materials, slope.tan);
      if (li && Math.abs(li.railingEnd - li.railingStart - li.clearWidth) > 0.1) {
        const offset = li.railingStart - li.clearStart;
        return { ...developed, widthMm: Math.max(1, li.railingEnd - li.railingStart), parts: developed.parts.map((p) => ({ ...p, x: p.x - offset })) };
      }
      return developed;
    }
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
    const model = src ? scaledWithReinforce(src, w, h, it.params.slats) : builtinToCustom(it.infillModelId as FenceModelId, materials, `skg_${idx}`, w, h, { miterFrame: true });
    return { ...model, name: src?.name ?? model.name, widthMm: w, heightMm: h, tolCtx: 'gate' };
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

/** Deo rama kapije za prvi korak sklapanja: ram (uglovi 45°), uspravne cevi ojačanja (platno šire od 2,5 m) i vodoravna ojačanja. */
export const isGateFramePart = (p: CustomModel['parts'][number]): boolean => isFramePart(p) || p.id.startsWith('rf_v') || p.id.startsWith('rf_h') || !!p.divider;

/** Koraci sklapanja kapije: koji delovi (po brojevima pozicija sklopnog crteža) idu u ram, a koji su ispuna modela koja se ubacuje u ram. */
export function gateStepParts(model: CustomModel, materials: Material[]): { frame: string[]; infill: string[]; frameNos: number[]; infillNos: number[] } | null {
  const linear = model.parts.filter((p) => !p.hw && !p.joint3d);
  const frame = linear.filter(isGateFramePart).map((p) => p.id);
  const infill = linear.filter((p) => !isGateFramePart(p)).map((p) => p.id);
  if (!frame.length || !infill.length || !model.parts.some(isFramePart)) return null;
  const sk = buildSketch(model, materials);
  const nos = (ids: string[]) => { const set = new Set(ids); return sk.positions.filter((p) => p.partIds.some((id) => set.has(id))).map((p) => p.no); };
  return { frame, infill, frameNos: nos(frame), infillNos: nos(infill) };
}

/**
 * Kote za postavljanje ojačanja u ram (prvi korak): po širini svetli otvori od unutrašnje ivice rama do uspravne cevi i između cevi
 * (sa širinom cevi), po visini isto za vodoravna ojačanja. Prazno kad ojačanja nema.
 */
export function frameStepChains(model: CustomModel, materials: Material[]): { left: ChainDim[]; bottom: ChainDim[] } {
  const W = model.widthMm; const H = model.heightMm;
  const boxes = model.parts.flatMap((p) => {
    const m = materials.find((x) => x.id === p.materialId); const sh = m ? materialShape(m) : null;
    return sh && sh.type === 'linear' && !p.hw && !p.joint3d ? [{ p, b: partBounds(p, sh) }] : [];
  });
  const vertical = (p: CustomModel['parts'][number]) => Math.abs(Math.sin((p.angleDeg * Math.PI) / 180)) > 0.99;
  const frame = boxes.filter(({ p }) => isFramePart(p));
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const chain = (lo: number, hi: number, tubes: [number, number][]): ChainDim[] => {
    const out: ChainDim[] = []; let at = lo;
    for (const [a, b] of [...tubes].sort((x, y) => x[0] - y[0])) {
      if (a - at > 0.5) out.push({ a: at, b: a, value: r1(a - at), kind: 'offset' });
      out.push({ a, b, value: r1(b - a), kind: 'gap' }); at = b;
    }
    if (hi - at > 0.5) out.push({ a: at, b: hi, value: r1(hi - at), kind: 'offset' });
    return out;
  };
  // unutrašnje ivice rama (bez rama: ivice platna)
  const innerL = Math.max(0, ...frame.filter(({ p, b }) => vertical(p) && b.x0 < W / 2).map(({ b }) => b.x1));
  const innerR = Math.min(W, ...frame.filter(({ p, b }) => vertical(p) && b.x1 > W / 2).map(({ b }) => b.x0));
  const innerB = Math.max(0, ...frame.filter(({ p, b }) => !vertical(p) && b.y0 < H / 2).map(({ b }) => b.y1));
  const innerT = Math.min(H, ...frame.filter(({ p, b }) => !vertical(p) && b.y1 > H / 2).map(({ b }) => b.y0));
  const vTubes = boxes.filter(({ p }) => p.id.startsWith('rf_v')).map(({ b }) => [b.x0, b.x1] as [number, number]);
  const hBands = new Map<string, [number, number]>();
  for (const { p, b } of boxes) if (p.id.startsWith('rf_h') || p.divider) hBands.set(`${r1(b.y0)}|${r1(b.y1)}`, [b.y0, b.y1]);
  return { bottom: vTubes.length ? chain(innerL, innerR, vTubes) : [], left: hBands.size ? chain(innerB, innerT, [...hBands.values()]) : [] };
}

/**
 * Redosled sklapanja kapije za radni nalog: 1) ram sa uspravnim cevima ojačanja i vodoravnim ojačanjima, 2) u gotov ram se ubacuje
 * ispuna izabranog modela (bočni U profili, prečke …). Brojevi pozicija su isti kao na sklopnom crtežu i u tabeli. Null kad kapija nema ram.
 */
export interface GateStep { title: string; png: string; rows: { no: number; name: string; length: string; count: number }[] }

export async function gateAssemblySteps(project: Project, idx: number, materials: Material[], color: string): Promise<{ steps: GateStep[] } | null> {
  const it = project.items[idx];
  if (!it || it.kind !== 'gate') return null;
  const model = elementModel(project, idx, materials);
  if (!model) return null;
  const sp = gateStepParts(model, materials);
  if (!sp) return null;
  const hw = model.parts.filter((p) => p.hw || p.joint3d).map((p) => p.id);
  const sk = buildSketch(model, materials);
  const rows = (nos: number[]) => sk.positions.filter((p) => nos.includes(p.no)).map((p) => ({ no: p.no, name: p.name, length: p.length, count: p.count }));
  const draw = async (title: string, hide: string[], mute: string[], chains?: { left: ChainDim[]; bottom: ChainDim[] }) => {
    const { svg, width, height } = await sketchSvgString(model, materials, true, color, { hide: [...hide, ...hw], mute, title, chains });
    const px = Math.min(2400, Math.round(width * Math.min(3, 2400 / width)));
    return svgToPng(svg, px, Math.min(Math.round((px * height) / width), 3400));
  };
  return { steps: [
    { title: 'Korak 1 — ram sa ojačanjima', png: await draw('Korak 1 — ram kapije sa uspravnim cevima i ojačanjima (kote: mesto ojačanja od unutrašnje ivice rama)', sp.infill, [], frameStepChains(model, materials)), rows: rows(sp.frameNos) },
    { title: 'Korak 2 — ispuna modela u ram', png: await draw('Korak 2 — u gotov ram se ubacuje ispuna modela', [], sp.frame), rows: rows(sp.infillNos) },
  ] };
}

/**
 * Skica za ceo projekat (ceo projekat, samo kapije ili samo ograda): samo skice nacrtanih modela sa kotama — za svaki element ograde
 * i krilo kapije mere, tabela delova, presek prečke i kote zavarivanja. Isti elementi ograde (model i mera) se crtaju jednom.
 */
export interface SketchPage { title: string; png: string; width: number; height: number }

export async function projectSketchPages(project: Project, materials: Material[], scope: PrintScope = 'all'): Promise<SketchPage[]> {
  const pages: SketchPage[] = [];
  const layout = computeLayout(project);
  const seen = new Map<string, { idx: number[]; model: CustomModel; at: number; labels?: string[] }>();
  const list: { idx: number[]; model: CustomModel; label?: string; leaves?: number; labels?: string[] }[] = [];
  project.items.forEach((it, i) => {
    if (!inPrintScope(it, scope) || it.kind === 'opening') return;
    const model = elementModel(project, i, materials, layout);
    if (!model) return;
    if (it.kind === 'fence') {
      // isti model i ista mera polja (svetli otvor, visina, raspored letvica) crtaju se jednom
      const key = `${it.modelId}|${model.widthMm}|${model.heightMm}|${itemSlope(layout.items[i]).tan}|${JSON.stringify(it.params.slats ?? null)}`;
      const ex = seen.get(key);
      if (ex) { ex.idx.push(i + 1); return; }
      const entry = { idx: [i + 1], model, at: list.length };
      seen.set(key, entry); list.push(entry);
    } else {
      // iste kapije (isti model, mere krila, tip, okov) crtaju se jednom: „Kapija 2, Kapija 4 (2 kom)“
      const key = `g|${it.infillModelId}|${model.widthMm}|${model.heightMm}|${it.gateType}|${it.opening}|${it.swing}|${it.lock}|${it.hinge}|${it.unequalLeaves ? it.leftLeafMm : 0}|${JSON.stringify(it.params.slats ?? null)}|${JSON.stringify(it.design?.hardware ?? null)}`;
      const ex = it.sliding ? undefined : seen.get(key);
      if (ex) { ex.idx.push(i + 1); ex.labels?.push(itemLabel(project.items, i)); return; }
      const entry = { idx: [i + 1], model, at: list.length, label: itemLabel(project.items, i), labels: [itemLabel(project.items, i)], leaves: it.gateType === 'double' ? (it.unequalLeaves ? 3 : 2) : 1 };
      if (!it.sliding) seen.set(key, entry as never);
      list.push(entry);
    }
  });
  for (const e of list) {
    const title = e.label
      // dvokrilna kapija: skica je jedno (levo) krilo; kod jednakih krila važi za oba
      ? `${e.labels && e.labels.length > 1 ? `${e.labels.join(', ')} (${e.labels.length} kom)` : e.label} — ${e.model.name || 'Model'}  ·  ${e.leaves === 2 ? 'krilo' : e.leaves === 3 ? 'levo krilo' : 'kapija'} ${e.model.widthMm} × ${e.model.heightMm} mm${e.leaves === 2 ? ' (2 krila)' : ''}`
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
