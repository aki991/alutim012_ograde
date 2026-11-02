import { strFromU8, unzipSync } from 'fflate';

const decodeXml = (s: string): string =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&');

/** Tekst iz <si>/<is> elementa (običan tekst ili delovi bogatog teksta). */
const textOf = (xml: string): string => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('');

/** "AB12" → indeks kolone (0 = A). */
const colIndex = (ref: string): number => {
  const letters = ref.replace(/[^A-Z]/gi, '').toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** Broj iz Excela kao tekst sa zarezom kao decimalnim znakom (isto kao izvoz), da ga čitač cena ne pomeša sa hiljadama. */
const numText = (raw: string): string => {
  const n = Number(raw);
  return Number.isFinite(n) ? String(Math.round(n * 1e9) / 1e9).replace('.', ',') : raw;
};

/**
 * Čita prvi list .xlsx dokumenta kao tabelu teksta (bez formula; prikazuju se sačuvane vrednosti).
 * Podržani su deljeni i umetnuti tekstovi i brojevi; ostalo se čita kao tekst.
 */
export function readXlsx(buffer: ArrayBuffer): string[][] {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(new Uint8Array(buffer)); } catch { throw new Error('Fajl nije ispravan Excel (.xlsx) dokument.'); }
  const read = (name: string): string | null => (files[name] ? strFromU8(files[name]) : null);
  const workbook = read('xl/workbook.xml');
  if (!workbook) throw new Error('Fajl nije ispravan Excel (.xlsx) dokument.');
  // prvi list: relId iz workbook.xml → putanja iz relacija
  const relId = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1];
  const rels = read('xl/_rels/workbook.xml.rels') ?? '';
  let target = 'worksheets/sheet1.xml';
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    if (relId && new RegExp(`\\bId="${relId}"`).test(m[0])) target = /\bTarget="([^"]+)"/.exec(m[0])?.[1] ?? target;
  }
  const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const sheet = read(path);
  if (!sheet) throw new Error('U Excel dokumentu nije pronađen list sa podacima.');

  const sharedXml = read('xl/sharedStrings.xml') ?? '';
  const shared = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));

  const rows: string[][] = [];
  for (const rm of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const body = cm[2] ?? '';
      const ref = /\br="([A-Z]+\d+)"/i.exec(attrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let val = '';
      if (type === 's' && v !== undefined) val = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') val = textOf(body);
      else if (type === 'str' || type === 'e') val = v !== undefined ? decodeXml(v) : '';
      else if (type === 'b') val = v === '1' ? 'DA' : 'NE';
      else if (v !== undefined) val = numText(v);
      const c = ref ? colIndex(ref) : row.length;
      while (row.length < c) row.push('');
      row[c] = val;
    }
    if (row.some((c) => c.trim() !== '')) rows.push(row);
  }
  return rows;
}
