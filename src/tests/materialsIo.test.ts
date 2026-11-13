import { describe, expect, it } from 'vitest';
import { SEED_MATERIALS } from './fixtures/materials';
import { FENCE_MODEL_LIST } from '../domain/models/catalog';
import { defaultSpec } from '../domain/models/spec';
import { applyImport, documentHasNewColumns, materialsToRows, parseCsv, parseNumber, planImport } from '../domain/pricing/materialsIo';
import { FILL_PROFILES, GUIDE_PROFILES } from '../domain/pricing/louverSpec';
import { toCsv } from '../services/exports';

describe('uvoz i izvoz cenovnika', () => {
  it('parseNumber čita srpski i engleski zapis', () => {
    expect(parseNumber('520')).toBe(520);
    expect(parseNumber('1.234,56')).toBe(1234.56);
    expect(parseNumber('1,234.56')).toBe(1234.56);
    expect(parseNumber('520,5')).toBe(520.5);
    expect(parseNumber('1.234')).toBe(1234);
    expect(parseNumber('12.5')).toBe(12.5);
    expect(parseNumber('RSD 1 450,00')).toBe(1450);
    expect(parseNumber('abc')).toBeNull();
  });

  it('parseCsv: razdvajač, navodnici i BOM', () => {
    expect(parseCsv('﻿a;b;c\r\n"x;y";2;"he said ""hi"""\r\n')).toEqual([['a', 'b', 'c'], ['x;y', '2', 'he said "hi"']]);
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('izvezena tabela se uvozi nazad bez izmena', () => {
    const csv = toCsv(materialsToRows(SEED_MATERIALS));
    const plan = planImport(SEED_MATERIALS, csv);
    expect(plan.fatal).toBeUndefined();
    expect(plan.counts.same).toBe(SEED_MATERIALS.length);
    expect(plan.counts.changed + plan.counts.error + plan.counts.unknown).toBe(0);
  });

  it('menja cene po šifri i po ID-u; ostala polja ostaju', () => {
    const a = SEED_MATERIALS[0]; const b = SEED_MATERIALS[1];
    const csv = `Šifra;Cena (RSD);ID\n${a.sku};999,5;\n;1.000;${b.id}\n`;
    const plan = planImport(SEED_MATERIALS, csv);
    expect(plan.counts.changed).toBe(2);
    const out = applyImport(SEED_MATERIALS, plan);
    const na = out.find((m) => m.id === a.id)!; const nb = out.find((m) => m.id === b.id)!;
    expect(na.unitPrice).toBe(999.5);
    expect(nb.unitPrice).toBe(1000);
    expect(na.name).toBe(a.name);
    expect(na.wastePercent).toBe(a.wastePercent);
    expect(na.demo).toBe(false);
    expect(out).toHaveLength(SEED_MATERIALS.length);
  });

  it('nepoznat materijal se preskače, a dodaje se samo na zahtev i sa svim podacima', () => {
    const csv = 'Šifra;Naziv;Kategorija;Jedinica;Cena\nNOVI-1;Nova cev;Profili;m;350\nNOVI-2;Bez jedinice;Profili;;10\n';
    const skip = planImport(SEED_MATERIALS, csv, false);
    expect(skip.counts.unknown).toBe(2);
    expect(applyImport(SEED_MATERIALS, skip)).toHaveLength(SEED_MATERIALS.length);
    const add = planImport(SEED_MATERIALS, csv, true);
    expect(add.counts.new).toBe(1);
    expect(add.counts.error).toBe(1);
    const out = applyImport(SEED_MATERIALS, add);
    expect(out).toHaveLength(SEED_MATERIALS.length + 1);
    expect(out[out.length - 1]).toMatchObject({ sku: 'NOVI-1', unit: 'm', unitPrice: 350, category: 'profil' });
  });

  it('greške: nema cene, neispravan broj, nema kolone', () => {
    const sku = SEED_MATERIALS[0].sku;
    const p = planImport(SEED_MATERIALS, `Šifra;Cena\n${sku};abc\n${sku};\n`);
    expect(p.counts.error).toBe(2);
    expect(planImport(SEED_MATERIALS, 'Naziv;Opis\nx;y').fatal).toBeDefined();
    expect(planImport(SEED_MATERIALS, 'Naziv;Cena\nx;5').fatal).toBeDefined();
    expect(planImport(SEED_MATERIALS, '').fatal).toBeDefined();
  });

  it('svi materijali koje kod koristi za modele postoje u cenovniku', () => {
    const ids = new Set(SEED_MATERIALS.map((m) => m.id));
    const used = new Set<string>();
    for (const m of FENCE_MODEL_LIST) {
      for (const id of [m.materialId, m.railMaterialId, m.accentMaterialId]) if (id) used.add(id);
      for (const part of defaultSpec(m.id)) used.add(part.materialId);
    }
    for (const g of Object.values(GUIDE_PROFILES)) used.add(g.materialId);
    for (const f of Object.values(FILL_PROFILES)) used.add(f.materialId);
    expect([...used].filter((id) => !ids.has(id))).toEqual([]);
  });
});

import { readFileSync } from 'node:fs';
describe('probni cenovnik (probni-cenovnik.csv)', () => {
  it('menja 5 cena i dodaje 3 nova materijala', () => {
    const text = readFileSync('probni-cenovnik.csv', 'utf-8');
    expect(documentHasNewColumns(text)).toBe(true);
    const plan = planImport(SEED_MATERIALS, text, true);
    expect(plan.fatal).toBeUndefined();
    expect(plan.counts).toMatchObject({ changed: 5, same: 1, new: 3, unknown: 0, error: 0 });
    expect(applyImport(SEED_MATERIALS, plan)).toHaveLength(SEED_MATERIALS.length + 3);
  });
});

import { readXlsx } from '../services/xlsx';
describe('uvoz Excel (.xlsx) dokumenta', () => {
  const file = () => { const b = readFileSync('probni-cenovnik.xlsx'); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
  it('čita tabelu: zaglavlje, tekst i decimalne brojeve', () => {
    const t = readXlsx(file());
    expect(t[0]).toEqual(['Šifra', 'Naziv', 'Kategorija', 'Jedinica', 'Cena (neto)', 'Otpad %', 'ID']);
    expect(t).toHaveLength(10);
    expect(t[3][4]).toBe('1790,5');
    expect(t[7][6]).toBe('');
  });
  it('daje isti plan uvoza kao CSV: 5 izmena, 1 isto, 3 nova', () => {
    const fromXlsx = planImport(SEED_MATERIALS, readXlsx(file()), true);
    const fromCsv = planImport(SEED_MATERIALS, readFileSync('probni-cenovnik.csv', 'utf-8'), true);
    expect(fromXlsx.counts).toMatchObject({ changed: 5, same: 1, new: 3, unknown: 0, error: 0 });
    expect(fromXlsx.counts).toEqual(fromCsv.counts);
    expect(fromXlsx.rows.map((r) => r.newPrice)).toEqual(fromCsv.rows.map((r) => r.newPrice));
  });
  it('neispravan fajl daje jasnu poruku', () => {
    expect(() => readXlsx(new TextEncoder().encode('ovo nije excel').buffer as ArrayBuffer)).toThrow(/Excel/);
  });
});

import { strToU8, zipSync } from 'fflate';
describe('xlsx sačuvan iz Excela (deljeni tekstovi, preskočene ćelije)', () => {
  it('čita sharedStrings, t="s", prazne kolone i zapis ćelija sa referencama', () => {
    const files = {
      'xl/workbook.xml': '<workbook xmlns:r="x"><sheets><sheet name="List1" sheetId="1" r:id="rId3"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId3" Type="t" Target="worksheets/sheet2.xml"/></Relationships>',
      'xl/sharedStrings.xml': '<sst><si><t>Šifra</t></si><si><t>Cena</t></si><si><r><t>DEMO-</t></r><r><t>HP-100</t></r></si></sst>',
      'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2" s="4"><v>1234.5</v></c></row></sheetData></worksheet>',
    };
    const z = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
    const t = readXlsx(z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength) as ArrayBuffer);
    expect(t).toEqual([['Šifra', '', 'Cena'], ['DEMO-HP-100', '', '1234,5']]);
    const plan = planImport(SEED_MATERIALS, t);
    expect(plan.counts.changed).toBe(1);
    expect(plan.rows[0].newPrice).toBe(1234.5);
  });
});

describe('tabela dobavljača sa drugačijim redosledom i nazivima kolona', () => {
  it('ID | Naziv | Cena | Jedinica: šifra dobavljača u koloni ID, bez kolone sa našim ID-om', () => {
    const csv = 'ID;Naziv artikla;Cena bez PDV;JM\nDEMO-HP-100;Profil;600;m\nDEMO-PP-250;Panel;1.300;m\n';
    const plan = planImport(SEED_MATERIALS, csv);
    expect(plan.fatal).toBeUndefined();
    expect(plan.counts.changed).toBe(2);
    expect(plan.rows[0].newPrice).toBe(600);
    expect(plan.rows[1].newPrice).toBe(1300);
  });
  it('kolone u drugom redosledu i sa srodnim naslovima', () => {
    const plan = planImport(SEED_MATERIALS, 'Cena;Opis;Šifra artikla\n640;x;DEMO-HP-100\n');
    expect(plan.counts.changed).toBe(1);
  });
});

describe('Ekoluka cenovnik 2026 (ekoluka-cenovnik-2026.xlsx)', () => {
  const b = readFileSync('ekoluka-cenovnik-2026.xlsx');
  const table = readXlsx(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  it('ima 72 artikla, bez grešaka u uvozu; postojeće Ekoluka šifre se ažuriraju, ostale se dodaju', () => {
    expect(table).toHaveLength(73);
    const plan = planImport(SEED_MATERIALS, table, true);
    expect(plan.counts.error).toBe(0);
    expect(plan.counts.unknown).toBe(0);
    expect(plan.counts.changed + plan.counts.same + plan.counts.new).toBe(72);
    const changedSkus = plan.rows.filter((r) => r.status === 'changed').map((r) => r.sku).sort();
    expect(changedSkus).toEqual(expect.arrayContaining(['KV000007', 'KV000016', 'KZ000003', 'KZ000004']));
  });
  it('cena šipke se deli dužinom šipke: KV000007 2.717 / 6 m, KU000016 1.710 / 6,5 m', () => {
    const plan = planImport(SEED_MATERIALS, table, true);
    expect(plan.rows.find((r) => r.sku === 'KV000007')!.newPrice).toBeCloseTo(452.83, 2);
    expect(plan.rows.find((r) => r.sku === 'KU000016')!.newPrice).toBeCloseTo(263.08, 2);
    expect(plan.rows.find((r) => r.sku === 'K100001')!.newPrice).toBe(2635);
  });
});

describe('uvoz sa cenom po šipki i hiljadama sa tačkom', () => {
  const table = [
    ['šifra', 'naziv proizvoda', 'RAL', 'JM', 'CENA BEZ PDV-A', 'CENA SA PDV-OM'],
    ['KV000007', 'KVADRATNA CEV', 'sirovo', '6m', '2.717 €', '3.260 €'],
    ['X-1', 'PROBNA LETVICA', '7016', '6.5m', '0.650 €', '0.780 €'],
    ['X-2', 'CEP', 'sirovo', 'kom', '1.250 €', '1.500 €'],
  ];
  it('bira cenu bez PDV-a, deli cenu šipke dužinom, tačka je razdvajač hiljada', () => {
    const plan = planImport(SEED_MATERIALS, table, true);
    expect(plan.counts).toMatchObject({ changed: 1, new: 2, error: 0 });
    const by = (sku: string) => plan.rows.find((r) => r.sku === sku)!;
    expect(by('KV000007').newPrice).toBeCloseTo(452.83, 2);
    expect(by('X-1').newPrice).toBe(100); // 0.650 = 650 din / 6,5 m
    expect(by('X-1').result).toMatchObject({ unit: 'm', name: 'Probna letvica, RAL 7016, šipka 6,5 m' });
    expect(by('X-2').newPrice).toBe(1250);
    expect(by('X-2').result?.unit).toBe('kom');
  });
  it('dokument samo sa cenom sa PDV-om se odbija', () => {
    expect(planImport(SEED_MATERIALS, [['šifra', 'cena sa pdv'], ['A', '10']]).fatal).toMatch(/PDV/);
  });
});
