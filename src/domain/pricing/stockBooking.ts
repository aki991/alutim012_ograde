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

/** dodaje komade u spisak pomeranja (ista vrsta, dužina i stavka magacina se sabira) */
function push(list: Offcut[], materialId: string, lengthMm: number, qty = 1, stockId?: string): void {
  const same = list.find((x) => x.materialId === materialId && x.lengthMm === lengthMm && x.stockId === stockId);
  if (same) same.qty += qty; else list.push({ materialId, lengthMm, qty, ...(stockId ? { stockId } : {}) });
}

export interface StockReservation {
  qty: number;
  projects: { id: string; name: string; qty: number }[];
}

/**
 * Rezervacije magacina: komadi koje su projekti izabrali iz magacina, a sečenje još nije proknjiženo (projekat nije „U izradi“ /
 * „Završeno“ i sečenje nije potvrđeno). Proknjižen komad je već skinut sa stanja pa se više ne broji kao rezervacija.
 * `bookings` su knjiženja iz podešavanja (`stockBookings`); ključ rezultata je ID stavke magacina.
 */
export function stockReservations(projects: Project[], exceptProjectId?: string, bookings?: Record<string, StockBookingRecord>): Map<string, StockReservation> {
  const out = new Map<string, StockReservation>();
  for (const p of projects) {
    if (p.modelDraft || p.id === exceptProjectId || isStockStatus(p.status) || bookings?.[p.id]) continue;
    for (const o of p.offcuts ?? []) {
      if (!o.stockId || o.qty <= 0) continue;
      const r = out.get(o.stockId) ?? { qty: 0, projects: [] };
      r.qty += o.qty;
      const same = r.projects.find((x) => x.id === p.id);
      if (same) same.qty += o.qty; else r.projects.push({ id: p.id, name: p.name, qty: o.qty });
      out.set(o.stockId, r);
    }
  }
  return out;
}

/** stavke koje su ovim pomeranjem pale na 0 se brišu; one koje su i ranije bile na 0 (ručno) ostaju */
const tidy = (stock: StockItem[], emptied: Set<string>): StockItem[] => stock.filter((s) => s.qty > 0 || !emptied.has(s.id));

function addToStock(stock: StockItem[], materialId: string, lengthMm: number, qty: number): void {
  const same = stock.find((s) => s.materialId === materialId && s.lengthMm === lengthMm && !s.note);
  if (same) same.qty += qty; else stock.push({ id: uid('stk'), materialId, lengthMm, qty });
}

/**
 * Knjiženje materijala iz krojne liste u magacin kad projekat pređe u „U izradi“ ili „Završeno“:
 * - komadi izabrani iz magacina (rezervisani) koje je krojna lista iskoristila skidaju se sa stanja;
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
    // iskorišćeni ostaci: sa stanja se skidaju samo komadi izabrani iz magacina (rezervisani), i to koliko ih je krojna lista
    // stvarno iskoristila; ručno uneti komadi nisu na stanju. Komadi iste dužine su zamenljivi, pa se prvo troše oni iz magacina.
    const usedByLen = new Map<number, number>();
    for (const bar of prof.bars) if (bar.offcut && bar.stockMm !== undefined) usedByLen.set(bar.stockMm, (usedByLen.get(bar.stockMm) ?? 0) + 1);
    for (const o of project.offcuts ?? []) {
      if (!o.stockId || materialName(materials, o.materialId) !== prof.profile) continue;
      const hit = stock.find((s) => s.id === o.stockId);
      const take = Math.min(o.qty, usedByLen.get(o.lengthMm) ?? 0, hit?.qty ?? 0);
      if (!hit || take <= 0) continue;
      usedByLen.set(o.lengthMm, (usedByLen.get(o.lengthMm) ?? 0) - take);
      hit.qty -= take;
      if (hit.qty === 0) emptied.add(hit.id);
      push(removed, hit.materialId, hit.lengthMm, take, hit.id);
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
  for (const r of record.removed) {
    // komad se vraća u svoju stavku (rezervacija projekta ostaje vezana za nju); obrisana stavka se vraća pod istim ID-em
    const own = r.stockId ? stock.find((s) => s.id === r.stockId) : undefined;
    if (own) { own.qty += r.qty; emptied.delete(own.id); } else if (r.stockId) stock.push({ id: r.stockId, materialId: r.materialId, lengthMm: r.lengthMm, qty: r.qty });
    else addToStock(stock, r.materialId, r.lengthMm, r.qty);
  }
  return tidy(stock, emptied);
}
