/**
 * Čitanje tabele cena iz PDF dokumenta (PDF sa pravim tekstom, ne sken).
 *
 * Tabela se rekonstruiše iz crteža ćelija: PDF alati svaku ćeliju crtaju kao pravougaonik, pa se spojene ćelije
 * (isti naziv, boja ili jedinica za više šifara) prepoznaju po visini pravougaonika. Zaglavlje se nalazi po koloni
 * „šifra"; svaki red ispod nje sa šifrom je jedan artikal. Ako PDF nema nacrtane ćelije, redovi se određuju po položaju
 * šifara, bez spojenih ćelija. Rezultat je tabela teksta u istom obliku kao CSV/Excel, pa ide kroz isti pregled uvoza.
 */

export interface PdfLib {
  getDocument: (src: { data: Uint8Array } & Record<string, unknown>) => { promise: Promise<PdfDoc> };
  OPS: Record<string, number>;
}
interface PdfDoc { numPages: number; getPage: (n: number) => Promise<PdfPage> }
interface PdfPage {
  getViewport: (o: { scale: number }) => { width: number; height: number; transform: number[] };
  getTextContent: () => Promise<{ items: { str?: string; transform: number[]; width: number; height: number }[] }>;
  getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[] }>;
}

interface TextItem { s: string; x: number; y: number; w: number; h: number }
interface Rect { x0: number; y0: number; x1: number; y1: number }

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
const area = (r: Rect): number => (r.x1 - r.x0) * (r.y1 - r.y0);
const contains = (r: Rect, x: number, y: number): boolean => x >= r.x0 - 0.5 && x <= r.x1 + 0.5 && y >= r.y0 - 0.5 && y <= r.y1 + 0.5;

const mul = (a: number[], b: number[]): number[] => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];

async function pageContent(lib: PdfLib, page: PdfPage): Promise<{ items: TextItem[]; cells: Rect[]; width: number; height: number }> {
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const items: TextItem[] = [];
  for (const it of tc.items) {
    const s = (it.str ?? '').trim();
    if (!s) continue;
    const t = mul(vp.transform, it.transform);
    items.push({ s, x: t[4], y: t[5] - (it.height || 8) / 2, w: it.width, h: it.height });
  }
  // ćelije: popunjeni pravougaonici (matrica se prati kroz save/restore/transform)
  const ops = await page.getOperatorList();
  const O = lib.OPS;
  let ctm = vp.transform.slice();
  const stack: number[][] = [];
  const cells: Rect[] = [];
  ops.fnArray.forEach((f, i) => {
    const a = ops.argsArray[i] as unknown;
    if (f === O.save) stack.push(ctm.slice());
    else if (f === O.restore) ctm = stack.pop() ?? ctm;
    else if (f === O.transform) ctm = mul(ctm, a as number[]);
    else if (f === O.constructPath) {
      const [op, , mm] = a as [number, unknown, Record<number, number> | undefined];
      if (op !== O.fill && op !== O.eoFill && op !== O.fillStroke && op !== O.stroke) return;
      if (!mm) return;
      const pts = [[mm[0], mm[1]], [mm[2], mm[1]], [mm[2], mm[3]], [mm[0], mm[3]]].map(([x, y]) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]);
      const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
      const r = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
      const w = r.x1 - r.x0; const h = r.y1 - r.y0;
      // ćelije tabele: ne tanke linije i ne cela strana
      if (w >= 12 && h >= 12 && w < vp.width * 0.95 && h < vp.height * 0.95) cells.push(r);
    }
  });
  return { items, cells, width: vp.width, height: vp.height };
}

const textIn = (items: TextItem[], r: Rect): string => {
  const inside = items.filter((i) => contains(r, i.x + i.w / 2, i.y)).sort((a, b) => (Math.abs(a.y - b.y) > 3 ? a.y - b.y : a.x - b.x));
  return inside.map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim();
};

const isSkuHeader = (s: string): boolean => /^(sifra|sku|kod|katalo)/.test(norm(s));
// šifra: kratak kod bez razmaka (najviše jedan), sa brojem ili crticom/kosom crtom (npr. KV000007, DEMO-ST-AL, PEGA 06)
const looksLikeSku = (s: string): boolean => (/\d/.test(s) || /[-/]/.test(s)) && !/\s{2,}/.test(s) && s.length <= 24 && /^[\p{L}\p{N}][\p{L}\p{N} \-/.×+_]*$/u.test(s);

interface PageTable { labels: string[]; rows: string[][] }

/** Tabela jedne strane preko nacrtanih ćelija; null ako ćelije ne postoje ili zaglavlje nije nađeno. */
function tableFromCells(items: TextItem[], cells: Rect[]): PageTable | null {
  const head = items.filter((i) => isSkuHeader(i.s)).sort((a, b) => a.y - b.y)[0];
  if (!head) return null;
  const skuHeaderCell = cells.filter((c) => contains(c, head.x + head.w / 2, head.y)).sort((a, b) => area(a) - area(b))[0];
  if (!skuHeaderCell) return null;
  const near = (a: number, b: number) => Math.abs(a - b) < 2;
  // zaglavlje: sve ćelije u istom redu kao ćelija sa „šifra"; zatim kolone sleva nadesno
  const inRow = cells.filter((c) => near(c.y0, skuHeaderCell.y0) && near(c.y1, skuHeaderCell.y1));
  // pomoćne kolone sa oznakom od jednog slova (mere A, B, C) mogu biti u tabeli pored, nešto drugačije visine zaglavlja
  const letterCols = cells.filter((c) => !inRow.includes(c) && Math.abs(c.y0 - skuHeaderCell.y0) < 15 && c.y1 <= skuHeaderCell.y1 + 15 && /^[A-Z]$/.test(textIn(items, c)));
  const headerCells = [...inRow, ...letterCols].sort((a, b) => a.x0 - b.x0);
  const labels = headerCells.map((c) => textIn(items, c));
  const skuCol = headerCells.indexOf(skuHeaderCell);
  // redovi: ćelije u koloni sa šifrom ispod zaglavlja
  const rowCells = cells.filter((c) => near(c.x0, skuHeaderCell.x0) && near(c.x1, skuHeaderCell.x1) && c.y0 >= skuHeaderCell.y1 - 1).sort((a, b) => a.y0 - b.y0);
  const rows: string[][] = [];
  for (const rc of rowCells) {
    const sku = textIn(items, rc);
    if (!looksLikeSku(sku)) continue;
    const cy = (rc.y0 + rc.y1) / 2;
    const row = headerCells.map((hc, ci) => {
      if (ci === skuCol) return sku;
      const cx = (hc.x0 + hc.x1) / 2;
      // najmanja ćelija kolone koja sadrži sredinu reda (spojena ćelija obuhvata više redova)
      const cell = cells.filter((c) => c.y0 >= skuHeaderCell.y1 - 1 && c.x0 < cx && c.x1 > cx && contains(c, cx, cy)).sort((a, b) => area(a) - area(b))[0];
      return cell ? textIn(items, cell) : '';
    });
    rows.push(row);
  }
  return rows.length ? { labels, rows } : null;
}

/** Rezervni način bez nacrtanih ćelija: kolone po zaglavlju, redovi oko šifara (bez spojenih ćelija). */
function tableFromText(items: TextItem[]): PageTable | null {
  const head = items.filter((i) => isSkuHeader(i.s)).sort((a, b) => a.y - b.y)[0];
  if (!head) return null;
  const headerBand = items.filter((i) => i.y >= head.y - 6 && i.y <= head.y + 22 && i.x >= head.x - 4);
  const sorted = [...headerBand].sort((a, b) => a.x - b.x);
  // kolone: stavke zaglavlja koje se preklapaju po x čine jednu kolonu (npr. „CENA" iznad „BEZ PDV-A")
  const cols: { x0: number; x1: number; parts: TextItem[] }[] = [];
  for (const it of sorted) {
    const last = cols[cols.length - 1];
    if (last && it.x < last.x1 + 2) { last.parts.push(it); last.x1 = Math.max(last.x1, it.x + it.w); } else cols.push({ x0: it.x, x1: it.x + it.w, parts: [it] });
  }
  if (cols.length < 2) return null;
  const labels = cols.map((c) => c.parts.sort((a, b) => a.y - b.y || a.x - b.x).map((p) => p.s).join(' '));
  const bounds = cols.map((c, i) => [i === 0 ? c.x0 - 6 : (cols[i - 1].x1 + c.x0) / 2, i === cols.length - 1 ? 1e6 : (c.x1 + cols[i + 1].x0) / 2]);
  const colOf = (x: number) => bounds.findIndex(([a, b]) => x >= a && x < b);
  const body = items.filter((i) => i.y > head.y + 22);
  const anchors = body.filter((i) => colOf(i.x + i.w / 2) === 0 && looksLikeSku(i.s)).sort((a, b) => a.y - b.y);
  if (!anchors.length) return null;
  const rows = anchors.map((a) => { const r = Array<string>(cols.length).fill(''); r[0] = a.s; return r; });
  for (const it of body) {
    const c = colOf(it.x + it.w / 2);
    if (c <= 0) continue;
    let best = 0;
    anchors.forEach((a, i) => { if (Math.abs(a.y - it.y) < Math.abs(anchors[best].y - it.y)) best = i; });
    rows[best][c] = [rows[best][c], it.s].filter(Boolean).join(' ');
  }
  return { labels, rows };
}

/**
 * Čita sve strane PDF-a i spaja ih u jednu tabelu (prvi red = naslovi kolona). Strane mogu imati različite kolone:
 * kolone se spajaju po naslovu, a prazna polja ostaju prazna.
 */
export async function readPdfTable(buffer: ArrayBuffer, lib: PdfLib): Promise<string[][]> {
  let doc: PdfDoc;
  try { doc = await lib.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise; } catch { throw new Error('Fajl nije ispravan PDF dokument.'); }
  const labels: string[] = [];
  const out: { [label: string]: string }[] = [];
  let anyText = false;
  for (let n = 1; n <= doc.numPages; n++) {
    const { items, cells } = await pageContent(lib, await doc.getPage(n));
    if (items.length) anyText = true;
    const t = tableFromCells(items, cells) ?? tableFromText(items);
    if (!t) continue;
    for (const l of t.labels) if (l && !labels.includes(l)) labels.push(l);
    for (const r of t.rows) {
      const rec: { [label: string]: string } = {};
      t.labels.forEach((l, i) => { if (l) rec[l] = r[i] ?? ''; });
      out.push(rec);
    }
  }
  if (!anyText) throw new Error('PDF nema tekst koji može da se pročita (verovatno je skeniran). Potreban je PDF sa pravim tekstom, ili Excel/CSV.');
  if (!out.length) throw new Error('U PDF-u nije pronađena tabela sa kolonom „šifra". Probajte Excel ili CSV.');
  return [labels, ...out.map((rec) => labels.map((l) => rec[l] ?? ''))];
}

/** Učitava pdf.js tek kad zatreba (velika biblioteka) i podešava radnika. */
export async function loadPdfJs(): Promise<PdfLib> {
  const lib = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  (lib.GlobalWorkerOptions as { workerSrc: string }).workerSrc = worker.default;
  return lib as unknown as PdfLib;
}
