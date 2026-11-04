import { rl10AuxPostShift, rl10JointShift } from '../models/rl10';
import { capTiers, isTarabicaPost, postCaps } from '../models/tarabica';
import { PLINTH_DEFAULT_MM, type LayoutItem, Mm, Post, Project } from '../models/types';
import { stairGroupAt, stairRise, treadLevelAt } from './stair';

export type PostRole = 'end' | 'intermediate' | 'gate';

export interface LaidOutItem {
  item: LayoutItem;
  index: number;
  /** Os levog stuba (x od ose prvog stuba) */
  axisStart: Mm;
  axisEnd: Mm;
  /** Svetli otvor između stubova (bez polovina stubova) */
  clearStart: Mm;
  clearEnd: Mm;
  clearWidth: Mm;
  /** Visina betonskog podnožja ispod elementa (0 ako ga nema) */
  plinthMm: Mm;
  /** Početak i kraj podnožja po osi (mm): podrazumevano od spoljne ivice levog do spoljne ivice desnog stuba, pa ide i ispod stubova */
  plinthX0: Mm;
  plinthX1: Mm;
  /** nivo poda (mm iznad najnižeg nivoa trase) kod levog i desnog stuba; razlikuju se samo kod stepeništa */
  floorStart: Mm;
  floorEnd: Mm;
}

export interface LaidOutPost {
  post: Post;
  index: number;
  x: Mm; // osa stuba
  role: PostRole;
  /** stub koji nikome ne treba (uz njega je samo prazan otvor): ne crta se, ne računa se i nema širinu */
  hidden: boolean;
  /** širina stuba u rasporedu: 0 za skriveni stub */
  widthMm: Mm;
  /** visina podnožja na kome stub stoji (aluminijumski stub i stub kapije stoje na podnožju ograde); inače 0 */
  baseMm: Mm;
  /** visina podnožja susednih ograda: od tog nivoa se meri visina stuba (post.heightMm), pa ne zavisi od visine podnožja */
  levelMm: Mm;
  /** vrh stuba od tla (nivo + visina) i stvarna dužina stuba od mesta na kome stoji (vrh − osnova) */
  topMm: Mm;
  lengthMm: Mm;
  /** nivo poda na kome stub stoji (mm iznad najnižeg nivoa trase): posle stepeništa trasa je na drugom nivou; inače 0 */
  floorMm: Mm;
  /** nivo linije nagiba (rukohvata) na mestu stuba: isti kao floorMm, osim stuba na stepeništu koji stoji na gazištu ispod nje */
  lineMm: Mm;
  /** pomeraj stuba duž ograde (mm, + udesno) uz zglob modela RL10: stub ne nosi zglob, nego stoji pored njega; inače 0 */
  shiftMm: Mm;
  /** model RL10, ugao u osnovi: pomoćni stub na dolazećoj ogradi (mm duž nje, − ulevo od ugla); inače null */
  auxShiftMm: Mm | null;
}

export interface ProjectLayout {
  items: LaidOutItem[];
  posts: LaidOutPost[];
  /** Zbir modularnih raspona (osa–osa) — "ukupna modularna dužina" */
  totalModularMm: Mm;
  /** Ukupna zauzeta dužina: modularna + po pola krajnjeg stuba sa svake strane */
  occupiedMm: Mm;
  /** Zbir svetlih otvora */
  totalClearMm: Mm;
  /** Broj fizičkih stubova (svaki stub se računa jednom) */
  postCount: number;
  /** Broj međustubova koje dele dva susedna elementa */
  sharedPostCount: number;
  /** Koliko stubova bi bilo da svaki element ima svoja dva stuba */
  naivePostCount: number;
  maxHeightMm: Mm;
  /** najviša tačka crteža od najnižeg nivoa trase (sa stepeništem i terasom na višem nivou); bez stepeništa isto što i maxHeightMm */
  maxTopMm: Mm;
  /** da li trasa ima stepenište (više nivoa) */
  hasLevels: boolean;
}

/** Razmaknik: tehnički „element" između dva stuba kapije koja ima svoje stubove; nije pravi element. */
export const isSpacer = (it: LayoutItem | undefined): boolean => it?.kind === 'opening' && Boolean(it.spacer);

/** Prazan otvor je samo razmak između ograda: stub koji graniči samo sa praznim otvorima (ili krajem) se ne postavlja. */
export function isHiddenPost(items: ReadonlyArray<LayoutItem>, index: number): boolean {
  const adj = [items[index - 1], items[index]].filter((x): x is LayoutItem => Boolean(x));
  return adj.length > 0 && adj.every((it) => it.kind === 'opening' && it.bendDeg === undefined);
}

export function postRole(project: Pick<Project, 'items'>, index: number): PostRole {
  const n = project.items.length;
  const left = project.items[index - 1];
  const right = project.items[index];
  if (left?.kind === 'gate' || right?.kind === 'gate') return 'gate';
  if (index === 0 || index === n) return 'end';
  return 'intermediate';
}

/** Visina podnožja između dva stuba: najveća među susednim stubovima tipa „concrete_plinth". */
/** Podnožje polja ograde: veće od podnožja koje traži polje samo i podnožja stubova sa podnožjem. */
export function itemPlinthMm(item: LayoutItem | undefined, left?: Post, right?: Post): Mm {
  return item?.kind === 'fence' ? Math.max(item.plinthMm ?? 0, plinthBetween(left, right)) : 0;
}

export function plinthBetween(left?: Post, right?: Post): Mm {
  return Math.max(0, ...[left, right].map((p) => (p?.type === 'concrete_plinth' ? (p.plinthMm ?? PLINTH_DEFAULT_MM) : 0)));
}

export function computeLayout(project: Pick<Project, 'items' | 'posts'>): ProjectLayout {
  const { items, posts } = project;
  let x = 0;
  const laidPosts: LaidOutPost[] = [];
  const laidItems: LaidOutItem[] = [];

  const hidden = posts.map((_, i) => isHiddenPost(items, i));
  const wOf = (i: number): Mm => (hidden[i] ? 0 : posts[i]?.widthMm ?? 0);
  posts.forEach((post, i) => {
    laidPosts.push({ post, index: i, x: 0, role: postRole(project, i), hidden: hidden[i], widthMm: wOf(i), baseMm: 0, levelMm: 0, topMm: 0, lengthMm: 0, floorMm: 0, lineMm: 0, shiftMm: 0, auxShiftMm: null });
  });

  items.forEach((item, i) => {
    const left = posts[i];
    const right = posts[i + 1];
    const axisStart = x;
    const axisEnd = x + item.widthMm;
    const clearStart = axisStart + wOf(i) / 2;
    const clearEnd = axisEnd - wOf(i + 1) / 2;
    // podrazumevano podnožje ide od spoljne ivice levog do spoljne ivice desnog stuba (dopune i ručna širina se primenjuju posle stubova)
    const plinthX0 = axisStart - wOf(i) / 2;
    const plinthX1 = axisEnd + wOf(i + 1) / 2;
    laidItems.push({ item, index: i, axisStart, axisEnd, clearStart, clearEnd, clearWidth: Math.max(0, clearEnd - clearStart), plinthMm: itemPlinthMm(item, left, right), plinthX0, plinthX1, floorStart: 0, floorEnd: 0 });
    laidPosts[i].x = axisStart;
    x = axisEnd;
  });
  if (laidPosts.length > items.length) laidPosts[items.length].x = x;

  // aluminijumski stub i stub kapije stoje na podnožju ograde: na najnižem podnožju susednih elemenata (uz kapiju ili otvor stoji na tlu)
  laidPosts.forEach((lp, i) => {
    if (lp.hidden || (lp.post.type !== 'aluminium' && lp.post.type !== 'gate')) return;
    const adj = [laidItems[i - 1], laidItems[i]].filter((l): l is LaidOutItem => Boolean(l) && !isSpacer(l.item));
    lp.baseMm = adj.length ? Math.min(...adj.map((l) => l.plinthMm)) : 0;
  });
  laidPosts.forEach((lp, i) => {
    const adj = [laidItems[i - 1], laidItems[i]].filter((l): l is LaidOutItem => Boolean(l) && !isSpacer(l.item));
    lp.levelMm = adj.length ? Math.max(...adj.map((l) => l.plinthMm)) : 0;
    lp.topMm = lp.levelMm + lp.post.heightMm;
    lp.lengthMm = Math.max(0, lp.topMm - lp.baseMm);
  });

  // rozetna u dnu stuba na podnožju je šira od stuba: kraj rozetne je kraj podnožja, pa se podnožje produžava ispod nje
  const flare = (lp: LaidOutPost | undefined): Mm => (lp && !lp.hidden && lp.baseMm > 0 && isTarabicaPost(items, lp.post, lp.index) && postCaps(lp.post).bottom === 'rosette' ? Math.max(0, (capTiers('rosette', lp.widthMm)[0].bottomW - lp.widthMm) / 2) : 0);
  laidItems.forEach((l) => {
    if (l.plinthMm <= 0 || l.item.kind !== 'fence') return;
    l.plinthX0 -= flare(laidPosts[l.index]);
    l.plinthX1 += flare(laidPosts[l.index + 1]);
    const own = l.item.plinthWidthMm;
    if (own && own > 0) {
      // zadato podnožje može biti samo kraće od polja sa stubovima; šire se dobija širenjem ograde, pa nikad ne prelazi preko suseda
      const half = Math.min(own, l.plinthX1 - l.plinthX0) / 2;
      const c = (l.plinthX0 + l.plinthX1) / 2;
      l.plinthX0 = c - half;
      l.plinthX1 = c + half;
    }
  });

  // nivoi poda: stepenište menja nivo za svoju visinsku razliku; najniži nivo trase je 0
  let level = 0;
  const levels: Mm[] = [0];
  laidItems.forEach((l) => {
    l.floorStart = level;
    level += stairRise(l.item);
    l.floorEnd = level;
    levels.push(level);
  });
  const minLevel = Math.min(0, ...levels);
  const hasLevels = levels.some((v) => v !== 0);
  laidItems.forEach((l) => { l.floorStart -= minLevel; l.floorEnd -= minLevel; });
  laidPosts.forEach((lp, i) => { lp.floorMm = (i < laidItems.length ? laidItems[i].floorStart : laidItems[i - 1]?.floorEnd ?? 0); lp.lineMm = lp.floorMm; });
  // stubovi unutar stepeništa stoje na gazištu: stub je duži za razliku između linije nagiba (rukohvata) i gazišta ispod njega
  laidPosts.forEach((lp, i) => {
    const g = stairGroupAt(items, i - 1);
    if (!g || i - 1 < g.from || i > g.to || stairGroupAt(items, i)?.from !== g.from) return;
    const a = laidItems[g.from];
    const b = laidItems[g.to];
    const { level, line } = treadLevelAt(lp.x, a.axisStart, b.axisEnd, a.floorStart, b.floorEnd, g.steps);
    const drop = Math.max(0, line - level);
    lp.lineMm = line;
    lp.floorMm = line - drop;
    lp.topMm += drop;
    lp.lengthMm += drop;
  });

  // RL10: stub uz zglob (spoj ravnog dela i stepeništa) je pomeren ka ravnom delu
  laidPosts.forEach((lp, i) => { lp.shiftMm = rl10JointShift(items, { items: laidItems }, i, posts); lp.auxShiftMm = rl10AuxPostShift(items, { items: laidItems }, i, posts); });

  const totalModularMm = x;
  const first = wOf(0);
  const last = wOf(posts.length - 1);
  const maxHeightMm = Math.max(0, ...laidItems.map((l) => l.item.heightMm + l.plinthMm), ...laidPosts.map((lp) => lp.topMm));

  return {
    items: laidItems,
    posts: laidPosts,
    totalModularMm,
    occupiedMm: totalModularMm + (first + last) / 2,
    totalClearMm: laidItems.reduce((s, i) => s + i.clearWidth, 0),
    postCount: hidden.filter((h) => !h).length,
    sharedPostCount: Math.max(0, hidden.slice(1, -1).filter((h) => !h).length),
    naivePostCount: items.length * 2,
    maxHeightMm,
    maxTopMm: Math.max(0, ...laidItems.map((l) => l.item.heightMm + l.plinthMm + Math.max(l.floorStart, l.floorEnd)), ...laidPosts.map((lp) => lp.topMm + lp.floorMm)),
    hasLevels,
  };
}

/**
 * Spoljna (zauzeta) dužina elementa = osa–osa plus po pola širine susednih stubova. Ovo je mera koju korisnik zadaje i vidi:
 * element od 1000 mm zauzima 1000 mm na terenu. Modularna mera (osa–osa) ostaje u podacima i obračunu.
 * Ugaoni spoj nema svoju spoljnu meru (razmak između dva stuba).
 */
export function postHalfSum(project: Pick<Project, 'items' | 'posts'>, index: number): Mm {
  const it = project.items[index];
  if (!it || (it.kind === 'opening' && it.bendDeg !== undefined)) return 0;
  const w = (i: number) => (isHiddenPost(project.items, i) ? 0 : project.posts[i]?.widthMm ?? 0);
  return (w(index) + w(index + 1)) / 2;
}

export const outerWidthMm = (project: Pick<Project, 'items' | 'posts'>, index: number): Mm => (project.items[index]?.widthMm ?? 0) + postHalfSum(project, index);

/** Ukupna zauzeta dužina cele ograde (od spoljne ivice prvog do spoljne ivice poslednjeg stuba). */
export const occupiedLengthMm = (project: Pick<Project, 'items' | 'posts'>): Mm => computeLayout(project).occupiedMm;

export const sumModularWidths = (items: LayoutItem[]): Mm => items.reduce((s, i) => s + i.widthMm, 0);

export type TotalStatus =
  | { state: 'auto' }
  | { state: 'ok' }
  | { state: 'under'; diffMm: Mm }
  | { state: 'over'; diffMm: Mm };

/** Odnos modularne dužine i zadate fiksne dužine (samo u režimu B). */
export function totalStatus(project: Project): TotalStatus {
  if (project.settings.totalMode !== 'fixed') return { state: 'auto' };
  const diff = project.settings.fixedTotalMm - sumModularWidths(project.items);
  if (diff === 0) return { state: 'ok' };
  return diff > 0 ? { state: 'under', diffMm: diff } : { state: 'over', diffMm: -diff };
}

/** Indeks umetanja (0..n) za zadatu x poziciju u mm (po sredinama elemenata). */
export function insertIndexForX(layout: ProjectLayout, xMm: Mm, skipId?: string): number {
  let idx = 0;
  for (const li of layout.items) {
    if (li.item.id === skipId) continue;
    const mid = (li.axisStart + li.axisEnd) / 2;
    if (xMm > mid) idx += 1;
  }
  return idx;
}
