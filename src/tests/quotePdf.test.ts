import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeedData } from '../data/seed';
import { finishingProject, FINISHING_MATERIALS, FINISHING_SPECS } from './fixtures/finishing';

const { definitions, front } = vi.hoisted(() => ({ definitions: [] as any[], front: vi.fn(async () => ({ dataUrl: 'data:image/png;base64,test', width: 1500, height: 500 })) }));
vi.mock('../services/exports', () => ({ frontViewPng: front, downloadBlob: vi.fn(), downloadCsv: vi.fn(), safeFilename: (s: string) => s }));
vi.mock('../services/pdfHeader', () => ({ BRAND_RED: '#d71920', loadHeaderLogos: async () => ({}), docHeader: (title: string) => ({ text: title }) }));
vi.mock('pdfmake/build/pdfmake', () => ({ default: { addVirtualFileSystem: vi.fn(), setFonts: vi.fn(), createPdf: (def: any) => { definitions.push(def); return { getBlob: async () => new Blob(['pdf']) }; } } }));
vi.mock('pdfmake/build/vfs_fonts', () => ({ default: {} }));
import { buildQuotePdfBlob } from '../services/pdf';
import { computePrice } from '../domain/pricing/calc';
import { buildQuotePrices, quoteDisplayAmounts } from '../domain/pricing/quote';

describe('PDF ponude ne otkriva internu kalkulaciju', () => {
  beforeEach(() => { definitions.length = 0; front.mockClear(); });
  it('sadrži crtež, osnovne podatke, cenu svakog elementa i jedan ukupan iznos', async () => {
    const p = finishingProject(); p.settings.pricing.coatingPerM2Rsd = 1234;
    const settings = { ...createSeedData().settings, modelSpecs: { h_white: FINISHING_SPECS.h_white! } };
    await buildQuotePdfBlob(p, { id: 'c', name: 'Kupac za proveru', address: '', phone: '', email: '', note: '' }, FINISHING_MATERIALS, settings);
    expect(front).toHaveBeenCalledWith(p, 1500);
    const def = definitions[0]; const data = JSON.stringify(def.content);
    expect(data).toContain('Kupac za proveru'); expect(data).toContain('Cena elemenata ograde');
    for (const privateText of ['Specifikacija materijala', 'Obračun cene', 'Marža', 'Uvećanje', 'Osnovica troška', 'Materijal ukupno', 'Plastificiranje', 'Popust', 'profitPercent', FINISHING_MATERIALS[0].name, FINISHING_MATERIALS[0].sku]) expect(data).not.toContain(privateText);
    expect(def.content.filter((node: any) => node.image)).toHaveLength(1);
    const tables = def.content.filter((node: any) => node.table);
    expect(tables).toHaveLength(2);
    const rows = tables[0].table.body.slice(1);
    expect(rows).toHaveLength(3);
    const parseRsd = (text: string) => Number(text.replace(/[^0-9-]/g, ''));
    expect(rows.reduce((sum: number, row: any[]) => sum + parseRsd(row[2].text), 0)).toBe(parseRsd(tables[1].table.body[0][1].text));
  });
  it('označava nepotpunu kalkulaciju sa nultim cenama bez izmene iznosa ponude', async () => {
    const p = finishingProject();
    const settings = { ...createSeedData().settings, modelSpecs: { h_white: FINISHING_SPECS.h_white! } };
    const materials = FINISHING_MATERIALS.map((m) => ({ ...m, unitPrice: 0 }));
    const count = computePrice(p, materials, settings.modelSpecs).unpricedCount;
    expect(count).toBeGreaterThan(0);
    await buildQuotePdfBlob(p, null, materials, settings);
    const def = definitions[0];
    expect(JSON.stringify(def.content)).toContain(`OBRAČUN NIJE POTPUN — stavki sa nedostupnom ili nultom cenom: ${count}`);
    const total = def.content.filter((node: any) => node.table).at(-1).table.body[0][1].text;
    const amounts = quoteDisplayAmounts(buildQuotePrices(p, materials, settings.modelSpecs), settings.currency, settings.currencyRateToEur);
    expect(Number(total.replace(/[^0-9-]/g, ''))).toBe(amounts.total);
  });
  it('ne dodaje upozorenje kada sve stavke imaju unetu pozitivnu cenu', async () => {
    const p = finishingProject();
    const settings = { ...createSeedData().settings, modelSpecs: { h_white: FINISHING_SPECS.h_white! } };
    expect(computePrice(p, FINISHING_MATERIALS, settings.modelSpecs).unpricedCount).toBe(0);
    await buildQuotePdfBlob(p, null, FINISHING_MATERIALS, settings);
    expect(JSON.stringify(definitions[0].content)).not.toContain('OBRAČUN NIJE POTPUN');
  });
});
