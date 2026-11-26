import type { Material, PricingPriceKey, PricingSettings } from '../models/types';

/**
 * „Vrati staru cenu“ u kalkulaciji: pri izmeni cene pamti se cena koja je bila upisana pre nje, a dugme je vraća.
 * Pamti se samo jedna prethodna cena (pre poslednje izmene); posle vraćanja dugme nestaje.
 */
const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** materijal sa novom cenom; stara cena se pamti (nepromenjena cena ne menja ništa) */
export function withNewPrice(m: Material, rsd: number): Material {
  if (same(m.unitPrice, rsd)) return m;
  return { ...m, unitPrice: rsd, prevUnitPrice: m.unitPrice, unitCorrection: undefined };
}

/** stara cena materijala, ako postoji i razlikuje se od trenutne */
export const previousPrice = (m: Material): number | null => (m.prevUnitPrice !== undefined && !same(m.prevUnitPrice, m.unitPrice) ? m.prevUnitPrice : null);

/** materijal sa vraćenom starom cenom */
export function withRestoredPrice(m: Material): Material {
  const prev = previousPrice(m);
  if (prev === null) return m;
  const { prevUnitPrice: _drop, ...rest } = m;
  return { ...rest, unitPrice: prev };
}

const current = (pr: PricingSettings, key: PricingPriceKey): number => pr[key] ?? 0;

/** parametri cene sa novom cenom rada, montaže ili plastificiranja; stara cena se pamti */
export function pricingWithNew(pr: PricingSettings, key: PricingPriceKey, rsd: number): PricingSettings {
  if (same(current(pr, key), rsd)) return pr;
  return { ...pr, [key]: rsd, previous: { ...pr.previous, [key]: current(pr, key) } };
}

/** stara cena u parametrima cene, ako postoji i razlikuje se od trenutne */
export function previousPricing(pr: PricingSettings, key: PricingPriceKey): number | null {
  const prev = pr.previous?.[key];
  return prev !== undefined && !same(prev, current(pr, key)) ? prev : null;
}

/** parametri cene sa vraćenom starom cenom */
export function pricingRestored(pr: PricingSettings, key: PricingPriceKey): PricingSettings {
  const prev = previousPricing(pr, key);
  if (prev === null) return pr;
  const previous = { ...pr.previous };
  delete previous[key];
  return { ...pr, [key]: prev, previous: Object.keys(previous).length ? previous : undefined };
}
