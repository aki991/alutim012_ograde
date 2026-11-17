import type { AppSettings, Material, Offcut, Project, ProjectStatus, StockBookingRecord, StockItem } from '../models/types';
import { materialIdForName, materialName } from '../models/spec';
import { buildCuttingList, cutOptions, DEFAULT_MIN_KEEP_MM } from './cutting';
import { uid } from '../../utils/id';

/** statusi u kojima je materijal projekta proknjižen u magacin (sečenje je počelo ili je gotovo) */
export const isStockStatus = (s: ProjectStatus): boolean => s === 'u_izradi' || s === 'zavrseno';

export interface StockBooking {
  /** novo stanje magacina */
  stock: StockItem[];
  /** šta je projekat promenio u magacinu (da bi se moglo povući kad se status vrati) */
  record: StockBookingRecord;
}

/** dodaje komade u spisak pomeranja (ista vrsta i dužina se sabira) */
function push(list: Offcut[], materialId: string, lengthMm: number, qty = 1): void {
  const same = list.find((x) => x.materialId === materialId && x.lengthMm === lengthMm);
  if (same) same.qty += qty; else list.push({ materialId, lengthMm, qty });
}

/** stavke koje su ovim pomeranjem pale na 0 se brišu; one koje su i ranije bile na 0 (ručno) ostaju */
const tidy = (stock: StockItem[], emptied: Set<string>): StockItem[] => stock.filter((s) => s.qty > 0 || !emptied.has(s.id));

function addToStock(stock: StockItem[], materialId: string, lengthMm: number, qty: number): void {
  const same = stock.find((s) => s.materialId === materialId && s.lengthMm === lengthMm && !s.note);
  if (same) same.qty += qty; else stock.push({ id: uid('stk'), materialId, lengthMm, qty });
}

/**
 * Knjiženje materijala iz krojne liste u magacin kad projekat pređe u „U izradi“ ili „Završeno“:
 * - ostaci iz magacina koje je krojna lista iskoristila skidaju se sa stanja;
 * - ostatak svake šipke posle sečenja, ako je dug bar koliko je zadato u podešavanjima, dodaje se na stanje (kraći je otpad).
 * Ostatak se vodi pod materijalom iz cenovnika (ili pod ugrađenim ID-em profila koga nema u cenovniku).
 */
export function bookProjectStock(project: Project, settings: AppSettings, materials: Material[]): StockBooking {
  const opts = cutOptions(settings);
  const minKeep = opts.minKeepMm ?? DEFAULT_MIN_KEEP_MM;
  const list = buildCuttingList(project, settings.modelSpecs, materials, opts);
  const stock = (settings.stock ?? []).map((s) => ({ ...s }));
  const emptied = new Set<string>();
  const added: Offcut[] = [];
  const removed: Offcut[] = [];

  for (const prof of list.profiles) {
    // iskorišćeni ostaci: skidaju se sa stanja ako su iz magacina (ručno uneti komadi nisu na stanju)
    for (const bar of prof.bars) {
      if (!bar.offcut || bar.stockMm === undefined) continue;
      const hit = stock.find((s) => s.qty > 0 && s.lengthMm === bar.stockMm && materialName(materials, s.materialId) === prof.profile);
      if (!hit) continue;
      hit.qty -= 1;
      if (hit.qty === 0) emptied.add(hit.id);
      push(removed, hit.materialId, hit.lengthMm);
    }
    // profil koga nema u cenovniku ostaje pod ugrađenim ID-em (isti naziv u magacinu i krojnoj listi)
    const materialId = materialIdForName(materials, prof.profile);
    // ostaci posle sečenja (i novih šipki i iskorišćenih ostataka)
    for (const bar of prof.bars) {
      const len = Math.floor(bar.leftoverMm);
      if (len <= 0 || len < minKeep) continue;
      addToStock(stock, materialId, len, 1);
      push(added, materialId, len);
    }
  }
  return { stock: tidy(stock, emptied), record: { at: new Date().toISOString(), added, removed } };
}

/**
 * Povlačenje knjiženja kad se status projekta vrati na „Nacrt“ ili „Ponuda“: dodati ostaci se skidaju sa stanja (koliko ih još ima;
 * ostatak koji je u međuvremenu iskorišćen u drugom projektu više nije na stanju), a ostaci koje je projekat uzeo vraćaju se u magacin.
 */
export function unbookProjectStock(stockIn: StockItem[], record: StockBookingRecord): StockItem[] {
  const stock = stockIn.map((s) => ({ ...s }));
  const emptied = new Set<string>();
  for (const a of record.added) {
    let left = a.qty;
    // prvo stavke bez napomene (tamo knjiženje dodaje), pa ostale iste vrste i dužine
    const hits = stock.filter((s) => s.materialId === a.materialId && s.lengthMm === a.lengthMm && s.qty > 0).sort((x, y) => Number(!!x.note) - Number(!!y.note));
    for (const s of hits) {
      if (left <= 0) break;
      const take = Math.min(left, s.qty);
      s.qty -= take; left -= take;
      if (s.qty === 0) emptied.add(s.id);
    }
  }
  for (const r of record.removed) addToStock(stock, r.materialId, r.lengthMm, r.qty);
  return tidy(stock, emptied);
}
