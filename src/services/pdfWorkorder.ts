import { STATUS_LABELS } from '../domain/models/catalog';
import type { AppSettings, Customer, Material, Project } from '../domain/models/types';
import { cutOptions, PRINT_SCOPE_LABELS, type PrintScope } from '../domain/pricing/cutting';
import { buildWorkOrder, type WorkElement } from '../domain/pricing/workorder';
import { fmtDate, fmtNum } from '../utils/units';
import { positionColors } from './cutlistSvg';
import { BRAND_RED, INK, LINE, MUTED, docHeader, fmtMm, svgToPng } from './pdfCutlist';
import { loadHeaderLogos } from './pdfHeader';
import { downloadBlob, safeFilename } from './exports';
import { getPdfMake, renderBlob } from './pdf';
import { schemaSvg } from './workorderSvg';
import { sameElementGroups } from './workorderGroups';
import { slidingWorkSvg } from './slidingWorkSvg';
import { elementAssembly, elementModel, gateAssemblySteps, sketchSvgString, type GateStep } from './pdfSketch';
import { pdfFinishing } from './pdfFinishing';

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
export async function buildWorkorderPdfBlob(project: Project, customer: Customer | null, materials: Material[], settings: AppSettings, scope: PrintScope = 'all'): Promise<Blob> {
  // deo projekta (samo kapije / ograda bez kapija) se vidi u naslovu, zaglavlju i podnožju
  const part = scope === 'all' ? '' : ` — ${PRINT_SCOPE_LABELS[scope].toLowerCase()}`;
  const pdfMake = await getPdfMake();
  const wo = buildWorkOrder(project, settings.modelSpecs, materials, { ...cutOptions(settings), scope });
  const colors = positionColors(wo.cutting.positions);
  // potpuno isti elementi (isti model, mere, boja, delovi i okov) čine jednu stavku „2×“: jedna kartica i jedan sklopni crtež sa skicom
  const groups = sameElementGroups(project, wo.elements);
  for (const g of groups) for (const m of g.members.slice(1)) { const c = colors.get(g.rep.key); if (c) colors.set(m.key, c); }
  const tagsOf = (g: { members: { key: string }[] }) => g.members.map((m) => tag(m.key)).join(' · ');
  const labelOf = (g: { rep: { label: string }; members: { label: string }[] }) => (g.members.length > 1 ? g.members.slice(0, 3).map((m) => m.label).join(', ') + (g.members.length > 3 ? '…' : '') : g.rep.label);
  const logos = await loadHeaderLogos();
  const info = settings.companyInfo ?? {};
  const contact = [info.address, info.phone, info.email, info.pib ? `PIB: ${info.pib}` : ''].filter(Boolean).join('  ·  ');
  const schema = schemaSvg(project, wo.positionOfItem, colors);
  const schemaPng = await svgToPng(schema.svg, schema.width * 2, schema.height * 2);
  const schemaW = 786;
  const schemaH = (schema.height / schema.width) * schemaW;

  const header = docHeader(`RADNI NALOG${part.toUpperCase()}`, `Ponuda: ${project.quoteNo || '—'}  ·  ${fmtDate(new Date().toISOString())}`, settings.companyName, contact, logos);
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
        card('STUBOVA ZA IZRADU', String(sm.posts)),
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
          // klizna kapija: prva kolona je broj dela na sklopnom crtežu
          widths: [...(e.slidingIndex !== undefined ? [18] : []), '*', 130, 54, 30],
          body: [
            [...(e.slidingIndex !== undefined ? [label('BR.')] : []), label('DEO'), label('PROFIL'), { ...label('DUŽINA'), alignment: 'right' }, { ...label('KOM.'), alignment: 'right' }],
            ...e.parts.map((p) => [
              ...(e.slidingIndex !== undefined ? [{ text: p.no !== undefined ? String(p.no) : '', fontSize: 9, bold: true, color: colors.get(e.key) ?? INK }] : []),
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

  const cards2: any[] = groups.map((grp) => {
    const e = grp.rep;
    const n = grp.members.length;
    const col = colors.get(e.key) ?? '#475569';
    const checks = e.slidingIndex !== undefined
      ? ['Delovi isečeni po krojnoj listi', 'Krilo i rep zavareni po crtežu', 'Okov ugrađen', 'Hod proveren', 'Mere proverene', 'Boja bez oštećenja']
      : [
          'Delovi isečeni po krojnoj listi',
          e.isGate ? 'Ram zavaren, ispuna ubačena' : 'Element sklopljen',
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
              { width: '*', text: [{ text: `${tagsOf(grp)}   `, bold: true, color: col, fontSize: 12 }, { text: labelOf(grp), bold: true, fontSize: 12 }, ...(n > 1 ? [{ text: `   ${n}×`, bold: true, fontSize: 13, color: BRAND_RED }] : []), { text: `   ${e.detail}`, fontSize: 8.5, color: MUTED }], margin: [0, 2, 0, 0] },
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

  // klizne kapije: sklopni crtež sa brojevima delova (iz tabele dela) i slovima okova (legenda pored crteža)
  const assemblies: any[] = [];
  // skica elementa sa kotama (pored sklopnog crteža): isti model i mera kao sklopni crtež
  const sketchOf = async (idx: number | undefined): Promise<{ png: string } | null> => {
    if (idx === undefined) return null;
    const model = elementModel(project, idx, materials);
    if (!model) return null;
    try {
      const { svg, width, height } = await sketchSvgString(model, materials);
      const px = Math.min(2600, Math.round(width * Math.min(3, 2600 / width)));
      return { png: await svgToPng(svg, px, Math.min(Math.round((px * height) / width), 3600)) };
    } catch { return null; }
  };
  const pair = (left: string, right: string | undefined, maxH: number): any => (right
    ? { columns: [
        { width: '*', stack: [{ text: 'SKLOPNI CRTEŽ', fontSize: 7.5, bold: true, color: MUTED, characterSpacing: 0.5, margin: [0, 0, 0, 2] }, { image: left, fit: [386, maxH], alignment: 'center' }] },
        { width: '*', stack: [{ text: 'SKICA SA KOTAMA', fontSize: 7.5, bold: true, color: MUTED, characterSpacing: 0.5, margin: [0, 0, 0, 2] }, { image: right, fit: [386, maxH], alignment: 'center' }] },
      ], columnGap: 14, margin: [0, 2, 0, 6] }
    : { image: left, fit: [786, maxH], alignment: 'center', margin: [0, 2, 0, 6] });
  // kapija: redovno sklapanje u dva koraka — prvo ram (sa uspravnim cevima preko 2,5 m i ojačanjima), pa se u njega ubacuje ispuna modela
  const stepsPage = async (idx: number | undefined, heading: string, col: string): Promise<any | null> => {
    if (idx === undefined) return null;
    const st = await gateAssemblySteps(project, idx, materials, col);
    if (!st) return null;
    const stepTable = (rows: GateStep['rows']): any => ({
      table: {
        headerRows: 1, dontBreakRows: true, widths: [16, '*', 46, 22],
        body: [[label('BR.'), label('DEO'), { ...label('DUŽINA'), alignment: 'right' }, { ...label('KOM.'), alignment: 'right' }],
          ...rows.map((r) => [{ text: String(r.no), bold: true, fontSize: 9, color: col }, { text: r.name, fontSize: 8.5 }, { text: r.length, fontSize: 8.5, alignment: 'right' }, { text: String(r.count), fontSize: 8.5, bold: true, alignment: 'right' }])],
      },
      layout: { hLineColor: () => LINE, hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 0 : 0.4), vLineWidth: () => 0, paddingTop: () => 2, paddingBottom: () => 2, paddingLeft: () => 2, paddingRight: () => 3 },
    });
    const longest = Math.max(...st.steps.map((x) => x.rows.length));
    const imgH = Math.max(120, Math.min(330, 531 - 56 - (longest + 1) * 15 - 40));
    return {
      pageBreak: 'before',
      stack: [
        section(`Redosled sklapanja — ${heading}`, 'Prvo se zavari ram sa uspravnim cevima (krilo šire od 2,5 m) i ojačanjima, pa se u gotov ram ubacuje ispuna izabranog modela (bočni U profili, prečke). Brojevi su isti kao na sklopnom crtežu.'),
        { columns: st.steps.map((x) => ({ width: '*', stack: [
          { text: x.title.toUpperCase(), fontSize: 8, bold: true, color: col, characterSpacing: 0.4, margin: [0, 0, 0, 3] },
          { image: x.png, fit: [386, imgH], alignment: 'center', margin: [0, 0, 0, 6] },
          stepTable(x.rows),
        ] })), columnGap: 14 },
      ],
    };
  };
  for (const grp of groups) {
    const e = grp.rep;
    const n = grp.members.length;
    const heading = `${tagsOf(grp)} ${labelOf(grp)}${n > 1 ? ` (${n}×)` : ''}`;
    const col = colors.get(e.key) ?? '#475569';
    const steps = e.isGate ? await stepsPage(e.slidingIndex ?? e.itemIndex, heading, col) : null;
    if (e.slidingIndex === undefined) {
      // ograda i krilne kapije: sklopni crtež u boji elementa (iste boje kao shema i kartica elementa), sa tabelom brojeva pored
      if (e.itemIndex === undefined) continue;
      const a = await elementAssembly(project, e.itemIndex, materials, col);
      if (!a) continue;
      // svaki sklopni crtež je na svojoj strani; crtež dobija ostatak visine posle legende (pdfmake odbacuje nedeljiv blok koji ne staje na stranicu)
      assemblies.push({
        pageBreak: 'before',
        stack: [
          section(`Sklopni crtež i skica — ${heading}`, 'Levo: sklopni crtež, broj u krugu je broj dela iz tabele (naziv, presek, dužina i uglovi). Desno: skica sa kotama zavarivanja. Mere su u mm, pogled spreda.'),
          pair(a.png, (await sketchOf(e.itemIndex))?.png, Math.max(120, Math.min(340, 531 - 56 - a.legendH - 30))),
          a.legend,
        ],
      });
      if (steps) assemblies.push(steps);
      continue;
    }
    const d = slidingWorkSvg(project, e.slidingIndex, e.parts, materials, col);
    if (!d) continue;
    const png = await svgToPng(d.svg, d.width * 2, d.height * 2);
    // legenda okova ispod crteža, u dve kolone (slovo ostaje uz svoje redove)
    const hwTable = (rows: typeof d.hardware): any => ({
      table: {
        widths: [16, '*', 34],
        body: [
          [label(''), label('OKOV NA CRTEŽU'), { ...label('KOM.'), alignment: 'right' }],
          ...rows.map((h, i) => [
            i > 0 && rows[i - 1].tag === h.tag ? { text: '' } : { text: h.tag, bold: true, fontSize: 9, color: '#ffffff', fillColor: '#334155', alignment: 'center' },
            { text: h.name, fontSize: 8.5 },
            { text: `${fmtNum(h.qty, 0)} ${h.unit}`, fontSize: 8.5, alignment: 'right' },
          ]),
        ],
      },
      layout: { hLineColor: () => LINE, hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 0 : 0.4), vLineWidth: () => 0, paddingTop: () => 2.5, paddingBottom: () => 2.5, paddingLeft: () => 3, paddingRight: () => 3 },
    });
    let cut = Math.ceil(d.hardware.length / 2);
    while (cut < d.hardware.length && cut > 0 && d.hardware[cut].tag === d.hardware[cut - 1].tag) cut += 1;
    const legend: any = d.hardware.length
      ? { columns: [{ width: '*', stack: [hwTable(d.hardware.slice(0, cut))] }, { width: '*', stack: cut < d.hardware.length ? [hwTable(d.hardware.slice(cut))] : [] }], columnGap: 24 }
      : { text: 'Okov nije postavljen na kapiju.', fontSize: 8.5, color: MUTED };
    assemblies.push({
      pageBreak: 'before',
      stack: [
        section(`Sklopni crtež${(await sketchOf(e.slidingIndex)) ? ' i skica' : ''} — ${heading}`, 'Broj u krugu je broj dela iz tabele elementa (naziv, profil, dužina i uglovi). Slovo je okov iz legende. Kote su u mm, pogled spreda, u stvarnom smeru otvaranja.'),
        pair(png, (await sketchOf(e.slidingIndex))?.png, Math.max(120, Math.min(340, 531 - 56 - (Math.ceil(d.hardware.length / 2) + 2) * 15 - 30))),
        legend,
      ],
    });
    if (steps) assemblies.push(steps);
  }

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
    : { text: 'Nema stubova za izradu.', color: MUTED };

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
    info: { title: `Radni nalog${part} — ${project.name}`, author: settings.companyName },
    footer: (page: number, pages: number) => ({
      columns: [
        { text: `${settings.companyName}  ·  Radni nalog${part}  ·  ${project.name}`, fontSize: 8, color: MUTED },
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
      { text: 'Boja i oznaka P1, P2… su iste kao na krojnoj listi: isečene komade razvrstaj po bojama pre sklapanja. Oznake S# predstavljaju stubove za izradu.', fontSize: 8.5, color: MUTED },
      ...(cards2.length
        ? [{ unbreakable: true, stack: [section('Elementi za sklapanje', 'Za svaki element: delovi sa dužinama i brojem komada, podaci i kontrolne tačke (čekiraj kad je gotovo).'), cards2[0]] }, ...cards2.slice(1)]
        : [section('Elementi za sklapanje'), { text: 'Projekat nema elemenata za sklapanje.', color: MUTED }]),
      ...assemblies,
      section('Stubovi za izradu'),
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
      ...pdfFinishing(wo.finishing),
    ],
  };
  return renderBlob(pdfMake, def);
}

export async function downloadWorkorderPdf(project: Project, customer: Customer | null, materials: Material[], settings: AppSettings): Promise<void> {
  downloadBlob(await buildWorkorderPdfBlob(project, customer, materials, settings), `radni-nalog_${safeFilename(project.name)}.pdf`);
}
