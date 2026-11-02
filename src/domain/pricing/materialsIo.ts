import type { Material, MaterialCategory, MaterialUnit } from '../models/types';

/** Nazivi kategorija kako se prikazuju u tabeli (i izvoze). */
export const MATERIAL_CATEGORY_LABELS: Record<MaterialCategory, string> = { profil: 'Profili', stub: 'Stubovi', okov: 'Okovi', automatika: 'Automatika', staklo: 'Staklo', panel: 'Paneli', ostalo: 'Ostalo' };
export const MATERIAL_UNITS: MaterialUnit[] = ['m', 'kom', 'set', 'm2', 'kg'];

export const EXPORT_HEADER = ['Šifra', 'Naziv', 'Kategorija', 'Jedinica', 'Cena (neto)', 'Otpad %', 'ID'];

/** Broj sa zarezom kao decimalnim znakom (Excel na srpskom ga tako čita). */
const num = (n: number): string => String(n).replace('.', ',');

export function materialsToRows(materials: Material[]): (string | number)[][] {
  return [EXPORT_HEADER, ...materials.map((m) => [m.sku, m.name, MATERIAL_CATEGORY_LABELS[m.category], m.unit, num(m.unitPrice), num(m.wastePercent), m.id])];
}

/** Čita broj u srpskom (1.234,56) ili engleskom (1,234.56) zapisu, sa oznakom valute ili razmacima; null ako nije broj. */
export function parseNumber(raw: string): number | null {
  const s = raw.replace(/\s| /g, '').replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let t = s;
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? ',' : '.';
    t = s.split(dec === ',' ? '.' : ',').join('').replace(dec, '.');
  } else if (lastComma >= 0) {
    t = (s.match(/,/g)?.length ?? 0) > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (lastDot >= 0) {
    const parts = s.split('.');
    // 1.234 ili 1.234.567: tačka je razdvajač hiljada; 12.5 i 0.125: decimalna tačka
    if (parts.length > 2 || (parts[1].length === 3 && parts[0].length >= 1 && parts[0].length <= 3 && Number(parts[0]) > 0)) t = parts.join('');
  }
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/** Razlaže CSV/TSV tekst: razdvajač (; , ili tab) se prepoznaje po prvom redu, navodnici i BOM su podržani. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] ?? '';
  const count = (c: string) => first.split(c).length - 1;
  const delim = [';', '\t', ','].map((c) => [c, count(c)] as const).sort((a, b) => b[1] - a[1])[0];
  const d = delim[1] > 0 ? delim[0] : ';';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === d) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();

type Col = 'id' | 'sku' | 'name' | 'category' | 'unit' | 'price' | 'priceGross' | 'waste' | 'ral' | 'dimA' | 'dimB' | 'dimC';
function mapHeader(h: string): Col | null {
  const n = norm(h);
  if (n === 'id') return 'id';
  // dobavljači koriste različite nazive kolona: prepoznaje se početak naslova, ne tačan naziv
  if (n.startsWith('sifra') || n.startsWith('sku') || n.startsWith('kod') || n.startsWith('katalo') || n.startsWith('art. br') || n === 'artikal') return 'sku';
  if (n.startsWith('naziv') || n.startsWith('opis') || n === 'name' || n === 'artikal naziv') return 'name';
  if (n.startsWith('kategorija') || n.startsWith('grupa')) return 'category';
  if (n.startsWith('jedinica') || n === 'jm' || n.startsWith('j.m')) return 'unit';
  // cena sa PDV-om se ne koristi (aplikacija računa neto cene): bira se kolona „bez PDV-a" ili obična „Cena"
  if (n.includes('sa pdv') || n.includes('bruto') || n.includes('with vat') || n.startsWith('mpc')) return 'priceGross';
  if (n.startsWith('cena') || n.startsWith('price') || n.startsWith('vpc')) return 'price';
  if (n === 'ral' || n.startsWith('boja')) return 'ral';
  if (n === 'a') return 'dimA';
  if (n === 'b') return 'dimB';
  if (n === 'c') return 'dimC';
  if (n.startsWith('otpad')) return 'waste';
  return null;
}

/** Promena cene veća od ovoga (u %) označava se u pregledu: obično znači drugu jedinicu mere (npr. cena po šipki od 6 m umesto po metru). */
export const BIG_CHANGE_PERCENT = 30;

export type ImportStatus = 'changed' | 'same' | 'new' | 'unknown' | 'error';

export interface ImportRow {
  line: number;
  status: ImportStatus;
  sku: string;
  name: string;
  oldPrice?: number;
  newPrice?: number;
  oldWaste?: number;
  newWaste?: number;
  message?: string;
  /** materijal posle uvoza (za changed i new) */
  result?: Material;
}

export interface ImportPlan {
  rows: ImportRow[];
  /** nema prepoznatih kolona (šifra ili ID i cena) — uvoz nije moguć */
  fatal?: string;
  counts: Record<ImportStatus, number>;
}

/** Jedinica iz dokumenta: „kom", „m"…, ili „6m" / „6,5m" = cena je po šipki te dužine. */
function parseUnit(raw: string): { unit?: MaterialUnit; barLen?: number } {
  const n = norm(raw).replace(/\s+/g, '').replace(',', '.');
  const bar = /^(\d+(?:\.\d+)?)m$/.exec(n);
  if (bar && Number(bar[1]) > 1) return { barLen: Number(bar[1]), unit: 'm' };
  const map: Record<string, MaterialUnit> = { m: 'm', kom: 'kom', 'kom.': 'kom', komad: 'kom', set: 'set', m2: 'm2', 'm²': 'm2', kg: 'kg' };
  return { unit: map[n] };
}

/** Kolona cena je u formatu hiljada sa tačkom (npr. „6.439", „0.402"): tada je tačka razdvajač hiljada, i kad je broj ispod 1.000. */
const THOUSANDS_CELL = /^\D*\d{1,3}\.\d{3}\D*$/;

/** Nazivi pisani velikim slovima (VELIKA SLOVA iz cenovnika) postaju običan tekst; reči sa brojevima i oznake A, B, C ostaju. */
function tidyName(name: string): string {
  const letters = name.replace(/[^\p{L}]/gu, '');
  if (letters.length < 4 || letters.replace(/[^\p{Lu}]/gu, '').length / letters.length < 0.7) return name;
  const w = name.split(' ').map((t) => (/\d/.test(t) || /^[A-Z]:?$/.test(t) ? t : t.toLowerCase()));
  w[0] = w[0].charAt(0).toUpperCase() + w[0].slice(1);
  return w.join(' ');
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

const categoryOf = (raw: string): MaterialCategory | null => {
  const n = norm(raw);
  for (const [key, label] of Object.entries(MATERIAL_CATEGORY_LABELS) as [MaterialCategory, string][]) if (norm(label) === n || key === n) return key;
  return null;
};

/**
 * Plan uvoza cenovnika iz CSV-a: red se uparuje sa postojećim materijalom po ID-u, a ako ga nema, po šifri.
 * Menjaju se samo cena i otpad (ako kolona postoji); naziv, jedinica i kategorija postojećih materijala ostaju.
 * Redovi koji se ne mogu upariti ignorišu se, ili se dodaju kao novi materijali ako je `addNew` i red ima sve podatke.
 */
export function planImport(existing: Material[], source: string | string[][], addNew = false): ImportPlan {
  const counts: ImportPlan['counts'] = { changed: 0, same: 0, new: 0, unknown: 0, error: 0 };
  const table = typeof source === 'string' ? parseCsv(source) : source;
  if (table.length < 2) return { rows: [], fatal: 'Dokument je prazan ili nema redova sa podacima.', counts };
  const cols = table[0].map(mapHeader);
  const has = (c: Col) => cols.includes(c);
  if (!has('price') && has('priceGross')) return { rows: [], fatal: 'Dokument ima samo cenu sa PDV-om. Aplikacija radi sa neto cenama: potrebna je kolona sa cenom bez PDV-a.', counts };
  if (!has('price')) return { rows: [], fatal: 'Nije pronađena kolona sa cenom. Prvi red mora imati naslove (npr. Šifra; Naziv; Cena).', counts };
  if (!has('id') && !has('sku')) return { rows: [], fatal: 'Nije pronađena kolona „Šifra" ni „ID", pa se redovi ne mogu upariti sa materijalima.', counts };
  const byId = new Map(existing.map((m) => [m.id, m]));
  const bySku = new Map(existing.map((m) => [m.sku.trim().toLowerCase(), m]));
  const seen = new Set<string>();
  const rows: ImportRow[] = [];
  const priceCol = cols.indexOf('price');
  const priceCells = table.slice(1).map((r) => (r[priceCol] ?? '').trim()).filter((c) => c !== '');
  const thousands = priceCells.length > 0 && priceCells.every((c) => THOUSANDS_CELL.test(c));
  const readPrice = (raw: string): number | null => (thousands ? parseNumber(raw.replace(/[^\d]/g, '')) : parseNumber(raw));

  table.slice(1).forEach((r, i) => {
    const get = (c: Col): string => { const k = cols.indexOf(c); return k >= 0 ? (r[k] ?? '').trim() : ''; };
    const line = i + 2;
    const sku = get('sku');
    const name = get('name');
    const idRaw = get('id');
    // kolona „ID" dobavljača je obično njegova šifra artikla: ako nije naš interni ID, pokušava se kao šifra
    const found = (idRaw && byId.get(idRaw)) || (sku && bySku.get(sku.toLowerCase())) || (idRaw && bySku.get(idRaw.toLowerCase())) || undefined;
    const priceRaw = get('price');
    let price = priceRaw === '' ? null : readPrice(priceRaw);
    const wasteRaw = get('waste');
    const waste = wasteRaw === '' ? null : parseNumber(wasteRaw);
    const base: ImportRow = { line, status: 'error', sku: found?.sku || sku || idRaw, name: found?.name || name };
    const push = (row: ImportRow) => { rows.push(row); counts[row.status]++; };

    if (price === null || price < 0) { push({ ...base, message: priceRaw === '' ? 'Nema cene.' : `Cena „${priceRaw}" nije ispravan broj.` }); return; }
    if (waste !== null && (waste < 0 || waste > 100)) { push({ ...base, message: `Otpad „${wasteRaw}" mora biti između 0 i 100.` }); return; }
    const docUnit = parseUnit(get('unit'));
    const notes: string[] = [];
    if (docUnit.barLen && (!found || found.unit === 'm')) {
      price = round2(price / docUnit.barLen);
      notes.push(`Cena šipke od ${String(docUnit.barLen).replace('.', ',')} m podeljena dužinom: ${String(price).replace('.', ',')} po metru.`);
    } else if (found && docUnit.unit && docUnit.unit !== found.unit) {
      notes.push(`Jedinica u dokumentu (${get('unit')}) razlikuje se od cenovnika (${found.unit}): proverite cenu.`);
    } else if (found && docUnit.barLen) {
      notes.push(`Cena je po šipki od ${String(docUnit.barLen).replace('.', ',')} m, a materijal se vodi u ${found.unit}: proverite cenu.`);
    }
    const note = notes.join(' ') || undefined;
    if (found) {
      if (seen.has(found.id)) { push({ ...base, message: 'Materijal se u dokumentu pojavljuje više puta; važi prvi red.' }); return; }
      seen.add(found.id);
      const newWaste = waste ?? found.wastePercent;
      const same = price === found.unitPrice && newWaste === found.wastePercent;
      push({
        ...base, status: same ? 'same' : 'changed', oldPrice: found.unitPrice, newPrice: price, oldWaste: found.wastePercent, newWaste, message: note,
        result: same ? undefined : { ...found, unitPrice: price, wastePercent: newWaste, demo: false },
      });
      return;
    }
    // nije pronađen u cenovniku
    if (addNew) {
      const unit = docUnit.unit;
      const cat = categoryOf(get('category')) ?? (unit === 'm' ? 'profil' : unit === 'kom' ? 'okov' : 'ostalo');
      // naziv + mere (kolone A, B, C) + boja: kod dobavljača su to često odvojene kolone
      const dims = [get('dimA'), get('dimB'), get('dimC')].map((d) => d.replace(/mm/gi, '').replace('.', ',').trim());
      const ral = get('ral');
      const fullName = name
        ? [tidyName(name), dims.every(Boolean) ? ` ${dims.join('×')} mm` : '', ral ? `, ${/^sirovo$/i.test(ral) ? 'sirovo' : `RAL ${ral}`}` : '', docUnit.barLen && docUnit.barLen !== 6 ? `, šipka ${String(docUnit.barLen).replace('.', ',')} m` : ''].join('')
        : '';
      if (sku && fullName && unit) {
        push({ ...base, name: fullName, status: 'new', newPrice: price, newWaste: waste ?? 0, message: note, result: { id: `mat_imp_${sku.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, sku, name: fullName, category: cat, unit, unitPrice: price, wastePercent: waste ?? 0, demo: false } });
        return;
      }
      push({ ...base, message: 'Novi materijal traži šifru, naziv i jedinicu (m, kom, set, m2, kg).' });
      return;
    }
    push({ ...base, status: 'unknown', newPrice: price, message: ['Nije u cenovniku (preskočeno).', note].filter(Boolean).join(' ') });
  });
  return { rows, counts };
}

/** Da li dokument ima kolone naziv i jedinica, tj. može da sadrži nove materijale (tada se oni podrazumevano dodaju, uz pregled). */
export function documentHasNewColumns(source: string | string[][]): boolean {
  const head = ((typeof source === 'string' ? parseCsv(source) : source)[0] ?? []).map(mapHeader);
  return head.includes('name') && head.includes('unit');
}

/** Cenovnik posle uvoza: izmenjeni materijali zamenjuju postojeće, novi se dodaju na kraj. */
export function applyImport(existing: Material[], plan: ImportPlan): Material[] {
  const changed = new Map(plan.rows.filter((r) => r.status === 'changed' && r.result).map((r) => [r.result!.id, r.result!]));
  const added = plan.rows.filter((r) => r.status === 'new' && r.result).map((r) => r.result!);
  return [...existing.map((m) => changed.get(m.id) ?? m), ...added];
}
