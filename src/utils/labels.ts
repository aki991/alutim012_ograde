import { isSpacer } from '../domain/geometry/layout';
import { GATE_LABELS } from '../domain/models/catalog';
import type { LayoutItem } from '../domain/models/types';

/** Čitljiv naziv elementa: „Platno 2" (deo ograde), „Klizna kapija", „Otvor 1". Numeracija po vrsti; kapije zadržavaju svoje nazive. */
export function itemLabel(items: LayoutItem[], index: number): string {
  const it = items[index];
  if (!it) return '';
  if (it.kind === 'gate') {
    const sameType = items.filter((x) => x.kind === 'gate' && x.gateType === it.gateType);
    const base = GATE_LABELS[it.gateType];
    return sameType.length > 1 ? `${base} ${sameType.indexOf(it) + 1}` : base;
  }
  const corner = (x: LayoutItem) => x.kind === 'opening' && x.bendDeg !== undefined;
  const same = items.filter((x) => x.kind === it.kind && corner(x) === corner(it) && !isSpacer(x));
  const base = it.kind === 'fence' ? 'Platno' : corner(it) ? 'Ugao' : 'Otvor';
  return `${base} ${same.indexOf(it) + 1}`;
}

/** Redni broj elementa (od 1) bez razmaknika: brojevi pozicija u listama i crtežima. */
export const itemNumber = (items: LayoutItem[], index: number): number => items.slice(0, index + 1).filter((x) => !isSpacer(x)).length;

/** Indeks elementa sa zadatim rednim brojem (bez razmaknika); -1 ako ga nema. */
export function indexOfNumber(items: LayoutItem[], n: number): number {
  let c = 0;
  for (let i = 0; i < items.length; i++) {
    if (!isSpacer(items[i])) { c += 1; if (c === n) return i; }
  }
  return -1;
}

export const shortLabel = (items: LayoutItem[], index: number): string => {
  const it = items[index];
  if (!it) return '';
  if (it.kind === 'gate') return GATE_LABELS[it.gateType].replace(' kapija', ' kap.');
  if (it.kind === 'fence') return `Platno ${items.slice(0, index + 1).filter((x) => x.kind === 'fence').length}`;
  return it.bendDeg !== undefined ? 'Ugao' : 'Otvor';
};
