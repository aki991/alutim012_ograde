import { createElement } from 'react';
import { GateSketchSvg } from '../components/gates/GateSketch';
import { DIM_BY_KEY, dimsFor, emptyDesign, fmt, HW_ROLE_LABELS, missingHardware, HW_STATUS_LABELS, ORIGIN_LABELS, resolveGate, STATUS_LABELS, SYSTEM_LABELS, systemOf } from '../domain/gates/design';
import { gateCutRows } from '../domain/gates/production';
import { computeLayout } from '../domain/geometry/layout';
import { FENCE_MODELS } from '../domain/models/catalog';
import type { AppSettings, Gate, Material, Project } from '../domain/models/types';
import { itemLabel } from '../utils/labels';
import { fmtDate } from '../utils/units';
import { downloadBlob, safeFilename } from './exports';
import { getPdfMake, renderBlob } from './pdf';
import { docHeader, INK, LINE, MUTED, svgToPng } from './pdfCutlist';
import { loadHeaderLogos } from './pdfHeader';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * PDF mera kapije: skica (zatvoreno / otvoreno), sve kote sa poreklom i statusom, okovi, krojna lista sa referencama i obradom
 * krajeva, otvorene stavke i status potvrda. Bez potvrde unetih mera dokument je označen kao radna verzija (nije za izradu).
 */
export async function buildGatePdfBlob(project: Project, itemId: string, materials: Material[], settings: AppSettings): Promise<Blob> {
  const index = project.items.findIndex((i) => i.id === itemId);
  const gate = project.items[index] as Gate;
  const li = computeLayout(project).items[index];
  const sys = systemOf(gate);
  const g: Gate = { ...gate, design: gate.design ?? emptyDesign(sys) };
  const res = resolveGate(g, li.clearWidth);
  const rows = gateCutRows(g, res, materials);
  const miss = missingHardware(g, sys);
  const { renderToStaticMarkup } = await import('react-dom/server');
  const svg = renderToStaticMarkup(createElement(GateSketchSvg, { gate: g, res, width: 900, postHs: [project.posts[index]?.heightMm, project.posts[index + 1]?.heightMm], postWs: [project.posts[index]?.widthMm, project.posts[index + 1]?.widthMm] })).replace('width="100%"', 'width="900"');
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  const h = m ? Number(m[2]) : 500;
  const png = await svgToPng(svg, 1800, Math.round(h * 2));
  const logos = await loadHeaderLogos();
  const label = itemLabel(project.items, index);
  const cell = (t: string, o: any = {}) => ({ text: t, fontSize: 8.5, ...o });
  const d = g.design!;
  const def: any = {
    pageSize: 'A4', pageMargins: [28, 26, 28, 38],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: INK },
    info: { title: `Mere kapije — ${project.name}`, author: settings.companyName },
    footer: (p: number, n: number) => ({ text: `${settings.companyName}  ·  ${project.name}  ·  ${label}  ·  ${p}/${n}`, fontSize: 8, color: MUTED, margin: [28, 12, 28, 0] }),
    content: [
      docHeader('MERE KAPIJE', `${project.name}  ·  ${label}  ·  ${SYSTEM_LABELS[sys]}  ·  ${fmtDate(new Date().toISOString())}`, settings.companyName, '', logos),
      { text: `Ispuna: ${FENCE_MODELS[g.infillModelId]?.name ?? g.infillModelId} · ${g.automation ? 'motorizovana' : 'ručna'} · ${g.gateType === 'sliding' ? `otvaranje ${g.opening === 'left' ? 'ulevo' : 'udesno'}` : `šarke ${g.opening === 'left' ? 'levo' : 'desno'}`} · ${d.viewFrom === 'ulica' ? 'gledano sa ulice' : 'gledano iz dvorišta'}${d.template ? ` · šablon „${d.template.name}“ v${d.template.version}` : ''}`, color: MUTED, margin: [0, 0, 0, 6] },
      { image: png, width: 539 },
      { text: 'Kote', bold: true, margin: [0, 8, 0, 3] },
      {
        table: {
          headerRows: 1, widths: ['*', 60, 70, 55, '*'],
          body: [
            ['Kota', 'Vrednost', 'Poreklo', 'Status', 'Referenca'].map((t) => cell(t, { bold: true })),
            ...dimsFor(sys).map((def) => { const r = res.values[def.key]; return [cell(def.label), cell(r.v === null ? 'nedostaje' : fmt(r.v, def.unit ?? 'mm'), { color: r.v === null ? '#b42318' : INK }), cell(ORIGIN_LABELS[r.origin]), cell(STATUS_LABELS[r.status ?? 'radna']), cell(`${def.part}${def.ref ? ` · ${def.ref}` : ''}`, { color: MUTED })]; }),
            ...(sys === 'cantilever' || sys === 'rail' ? [[cell('Smin / Pmin / nedostaje prostora'), cell(`${fmt(res.derived.Smin)} / ${fmt(res.derived.Pmin)} / ${fmt(res.derived.shortfall)}`, { colSpan: 4 }), '', '', '']] : []),
            ...d.extra.filter((x) => x.inExport).map((x) => [cell(x.name || 'Dodatna kota'), cell(x.valueMm === null ? 'nedostaje' : fmt(x.valueMm)), cell(x.link ? `zadaje: ${DIM_BY_KEY[x.link]?.label ?? x.link}` : 'dodatna kota'), cell(''), cell(`${x.part}${x.ref ? ` · ${x.ref}` : ''}`, { color: MUTED })]),
          ],
        },
        layout: { hLineColor: () => LINE, vLineColor: () => LINE },
      },
      { text: 'Okovi', bold: true, margin: [0, 8, 0, 3] },
      d.hardware.length || miss.length ? {
        table: { headerRows: 1, widths: [80, '*', 30, '*'], body: [['Uloga', 'Naziv / šifra', 'Kom.', 'Granice / status'].map((t) => cell(t, { bold: true })), ...[...d.hardware.map((x) => [cell(HW_ROLE_LABELS[x.role]), cell(`${x.name}${x.code ? ` (${x.code})` : ' (bez fabričke šifre)'}${x.supplier ? ` · ${x.supplier}` : ''}`), cell(String(x.qty)), cell(`${x.minGapMm !== undefined ? `min ${x.minGapMm} mm ` : ''}${x.maxGapMm !== undefined ? `max ${x.maxGapMm} mm ` : ''}${x.nominalGapMm !== undefined ? `nom. ${x.nominalGapMm} mm ` : ''}· ${HW_STATUS_LABELS[x.status]}${x.doc ? ` · ${x.doc}` : ''}`)]), ...miss.map((r) => [cell(HW_ROLE_LABELS[r.role]), cell('nepoznata oznaka'), cell(String(r.qty)), cell('—')])]] },
        layout: { hLineColor: () => LINE, vLineColor: () => LINE },
      } : { text: 'Okovi nisu zadati.', color: MUTED },
      { text: 'Krojna lista kapije', bold: true, margin: [0, 8, 0, 3] },
      {
        table: {
          headerRows: 1, widths: [80, '*', 25, 60, '*'],
          body: [['Sklop / deo', 'Profil', 'Kom.', 'Rezna dužina', 'Kraj / referenca'].map((t) => cell(t, { bold: true })),
            ...rows.map((r) => [cell(`${r.assembly}\n${r.part}`), cell(`${r.profile}${r.code ? ` (${r.code})` : ''}`), cell(String(r.qty)),
              cell(r.lengthMm === null ? `nedostaje: ${r.missing.map((k) => DIM_BY_KEY[k]?.label ?? k).join(', ')}` : `${fmt(r.lengthMm)}${r.manual ? `\nručno (geom. ${fmt(r.geometricMm)})` : ''}`, { color: r.lengthMm === null ? '#b42318' : INK }),
              cell(`${r.ends} · ${r.ref}`, { color: MUTED })])],
        },
        layout: { hLineColor: () => LINE, vLineColor: () => LINE },
      },
      { text: 'Provere i otvorene stavke', bold: true, margin: [0, 8, 0, 3] },
      { ul: res.issues.length ? res.issues.map((i) => ({ text: i.msg, color: i.level === 'error' ? '#b42318' : i.level === 'warn' ? '#93370d' : MUTED, fontSize: 8.5 })) : [{ text: 'Nema otvorenih stavki.', fontSize: 8.5 }] },
      ...(d.configDoc || d.notes ? [{ text: [d.configDoc ? `Konfiguracioni dokument: ${d.configDoc}. ` : '', d.notes ?? ''].join(''), margin: [0, 6, 0, 0], fontSize: 8.5 }] : []),
    ],
  };
  return renderBlob(await getPdfMake(), def);
}

export async function downloadGatePdf(project: Project, itemId: string, materials: Material[], settings: AppSettings): Promise<void> {
  downloadBlob(await buildGatePdfBlob(project, itemId, materials, settings), `mere_kapije_${safeFilename(project.name)}.pdf`);
}
