import { GATE_LABELS } from '../domain/models/catalog';
import type { LayoutItem } from '../domain/models/types';

/** Čitljiv naziv elementa: „Ograda 2", „Klizna kapija", „Otvor 1". Numeracija po vrsti. */
export function itemLabel(items: LayoutItem[], index: number): string {
  const it = items[index];
  if (!it) return '';
  if (it.kind === 'gate') {
    const sameType = items.filter((x) => x.kind === 'gate' && x.gateType === it.gateType);
    const base = GATE_LABELS[it.gateType];
    return sameType.length > 1 ? `${base} ${sameType.indexOf(it) + 1}` : base;
  }
  const corner = (x: LayoutItem) => x.kind === 'opening' && x.bendDeg !== undefined;
  const same = items.filter((x) => x.kind === it.kind && corner(x) === corner(it));
  const base = it.kind === 'fence' ? 'Ograda' : corner(it) ? 'Ugao' : 'Otvor';
  return `${base} ${same.indexOf(it) + 1}`;
}

export const shortLabel = (items: LayoutItem[], index: number): string => {
  const it = items[index];
  if (!it) return '';
  if (it.kind === 'gate') return GATE_LABELS[it.gateType].replace(' kapija', ' kap.');
  if (it.kind === 'fence') return `Polje ${items.slice(0, index + 1).filter((x) => x.kind === 'fence').length}`;
  return it.bendDeg !== undefined ? 'Ugao' : 'Otvor';
};
