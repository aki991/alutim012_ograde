import { computeLayout } from '../geometry/layout';
import type { ModelSpecs } from '../models/spec';
import type { Material, Project } from '../models/types';
import { buildBom, buildElementFinishing, computePrice } from './calc';

export interface QuoteElementPrice { index: number; amountRsd: number }
export interface QuotePrices { elements: QuoteElementPrice[]; totalRsd: number }

/** Razdeljuje trošak po udelima. Nulti udeli koriste podjednaku raspodelu. */
const shares = (total: number, weights: number[]): number[] => {
  const sum = weights.reduce((a, b) => a + Math.max(0, b), 0);
  return weights.map((w) => total * (sum > 0 ? Math.max(0, w) / sum : 1 / weights.length));
};

/**
 * Konačna cena svakog platna/kapije. Materijal se raspodeljuje prema udelu elementa u istoj BOM stavci,
 * pa cele šipke, otpad i zajednički materijal ne ulaze dva puta. Zajednički stubovi i opšti troškovi
 * dele se po širini elemenata. Izrada/ugradnja kapije ostaje na kapiji; plastificiranje prati površinu.
 * Zarada, popust i PDV primenjuju se istim faktorom kao u postojećoj kalkulaciji celog projekta.
 */
export function buildQuotePrices(project: Project, materials: Material[], specs?: ModelSpecs): QuotePrices {
  const price = computePrice(project, materials, specs);
  const layout = computeLayout(project);
  const indices = project.items.flatMap((it, i) => it.kind === 'opening' ? [] : [i]);
  if (!indices.length) return { elements: [], totalRsd: price.grossTotal };
  const widths = indices.map((i) => Math.max(0, project.items[i].widthMm - layout.items[i].clearWidth + layout.items[i].railingEnd - layout.items[i].railingStart));
  const quantities = indices.map((index) => {
    const part: Project = { ...project, items: project.items.map((it, i) => i === index || it.kind === 'opening' ? it : { kind: 'opening', id: it.id, widthMm: it.widthMm, heightMm: it.heightMm }) };
    return new Map(buildBom(part, materials, specs, { netLengths: true, includePosts: false }).map((l) => [l.key, l.geometricQty]));
  });
  const costs = indices.map(() => 0);
  const add = (values: number[]) => values.forEach((v, i) => { costs[i] += v; });
  const bom = buildBom(project, materials, specs);
  for (const line of bom.filter((l) => l.materialId !== 'extra')) {
    const own = quantities.map((q) => q.get(line.key) ?? 0);
    add(shares(line.total, own.some((q) => q > 0) ? own : widths));
  }
  const reserve = bom.filter((l) => l.materialId === 'extra').reduce((sum, l) => sum + l.total, 0);
  add(shares(reserve, costs));
  const pr = project.settings.pricing;
  indices.forEach((index, n) => {
    const it = project.items[index];
    costs[n] += it.kind === 'gate' ? pr.laborPerGateRsd + pr.installPerGateRsd
      : it.kind === 'fence' ? Math.max(0, layout.items[index].railingEnd - layout.items[index].railingStart) * it.heightMm / 1e6 * pr.laborPerM2Rsd : 0;
  });
  add(shares(price.installTotal - indices.filter((i) => project.items[i].kind === 'gate').length * pr.installPerGateRsd, widths));
  const areas = indices.map((index) => buildElementFinishing(project, [index], materials, specs).areaM2);
  const ownArea = areas.reduce((sum, a) => sum + a, 0);
  // Površina stubova se dodaje jednom; kod neprekinutih nizova se normalizuju krajnji prepusti.
  const sharedArea = shares(Math.max(0, price.coatingAreaM2 - ownArea), widths);
  add(shares(price.coatingTotal, areas.map((a, i) => a + sharedArea[i])));
  const allocated = costs.reduce((sum, c) => sum + c, 0);
  const amounts = shares(price.grossTotal, allocated > 0 ? costs : widths);
  return { elements: indices.map((index, i) => ({ index, amountRsd: amounts[i] })), totalRsd: price.grossTotal };
}

/** Zaokružene cene u valuti prikaza. Zbir redova je uvek isti kao prikazani ukupan iznos. */
export function quoteDisplayAmounts(quote: QuotePrices, currency: string, rateToEur: number): { elements: number[]; total: number; digits: number } {
  const digits = currency === 'EUR' ? 2 : 0;
  const scale = 10 ** digits;
  const rate = currency === 'EUR' && rateToEur > 0 ? rateToEur : 1;
  const units = Math.round(quote.totalRsd / rate * scale);
  const exact = shares(units, quote.elements.map((e) => e.amountRsd));
  const rounded = exact.map(Math.floor);
  const order = exact.map((v, i) => ({ i, fraction: v - rounded[i] })).sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  const remainder = units - rounded.reduce((a, b) => a + b, 0);
  for (let n = 0; n < remainder && n < order.length; n++) rounded[order[n].i] += 1;
  return { elements: rounded.map((n) => n / scale), total: units / scale, digits };
}
