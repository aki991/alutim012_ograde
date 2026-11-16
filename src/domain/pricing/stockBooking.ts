import type { AppSettings, Material, Project, StockItem } from '../models/types';
import { materialIdForName, materialName } from '../models/spec';
import { buildCuttingList, cutOptions, DEFAULT_MIN_KEEP_MM } from './cutting';
import { uid } from '../../utils/id';

export interface StockBooking {
  /** novo stanje magacina */
  stock: StockItem[];
  /** komada ostataka vraćenih u magacin */
  added: number;
  /** komada skinutih iz magacina (iskorišćeni ostaci iz magacina) */
  removed: number;
}

/**
 * Knjiženje materijala iz krojne liste u magacin kad projekat pređe u „U izradi“:
 * - ostaci iz magacina koje je krojna lista iskoristila skidaju se sa stanja;
 * - ostatak svake šipke posle sečenja, ako je dug bar koliko je zadato u podešavanjima, dodaje se na stanje (kraći je otpad).
 * Ostatak se vodi pod materijalom iz cenovnika (ili pod ugrađenim ID-em profila koga nema u cenovniku).
 */
export function bookProjectStock(project: Project, settings: AppSettings, materials: Material[]): StockBooking {
  const opts = cutOptions(settings);
  const minKeep = opts.minKeepMm ?? DEFAULT_MIN_KEEP_MM;
  const list = buildCuttingList(project, settings.modelSpecs, materials, opts);
  const stock = (settings.stock ?? []).map((s) => ({ ...s }));
  let added = 0;
  let removed = 0;

  for (const prof of list.profiles) {
    // iskorišćeni ostaci: skidaju se sa stanja ako su iz magacina (ručno uneti komadi nisu na stanju)
    for (const bar of prof.bars) {
      if (!bar.offcut || bar.stockMm === undefined) continue;
      const hit = stock.find((s) => s.qty > 0 && s.lengthMm === bar.stockMm && materialName(materials, s.materialId) === prof.profile);
      if (hit) { hit.qty -= 1; removed += 1; }
    }
    // profil koga nema u cenovniku ostaje pod ugrađenim ID-em (isti naziv u magacinu i krojnoj listi)
    const materialId = materialIdForName(materials, prof.profile);
    // ostaci posle sečenja (i novih šipki i iskorišćenih ostataka)
    for (const bar of prof.bars) {
      const len = Math.floor(bar.leftoverMm);
      if (len <= 0 || len < minKeep) continue;
      const same = stock.find((s) => s.materialId === materialId && s.lengthMm === len && !s.note);
      if (same) same.qty += 1;
      else stock.push({ id: uid('stk'), materialId, lengthMm: len, qty: 1 });
      added += 1;
    }
  }
  return { stock: stock.filter((s, i) => s.qty > 0 || (settings.stock ?? [])[i]?.qty === 0), added, removed };
}
