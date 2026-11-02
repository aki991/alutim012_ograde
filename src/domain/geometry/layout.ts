import { PLINTH_DEFAULT_MM, type LayoutItem, Mm, Post, Project } from '../models/types';

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
}

export interface LaidOutPost {
  post: Post;
  index: number;
  x: Mm; // osa stuba
  role: PostRole;
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
export function plinthBetween(left?: Post, right?: Post): Mm {
  return Math.max(0, ...[left, right].map((p) => (p?.type === 'concrete_plinth' ? (p.plinthMm ?? PLINTH_DEFAULT_MM) : 0)));
}

export function computeLayout(project: Pick<Project, 'items' | 'posts'>): ProjectLayout {
  const { items, posts } = project;
  let x = 0;
  const laidPosts: LaidOutPost[] = [];
  const laidItems: LaidOutItem[] = [];

  posts.forEach((post, i) => {
    laidPosts.push({ post, index: i, x: 0, role: postRole(project, i) });
  });

  items.forEach((item, i) => {
    const left = posts[i];
    const right = posts[i + 1];
    const axisStart = x;
    const axisEnd = x + item.widthMm;
    const clearStart = axisStart + (left?.widthMm ?? 0) / 2;
    const clearEnd = axisEnd - (right?.widthMm ?? 0) / 2;
    laidItems.push({ item, index: i, axisStart, axisEnd, clearStart, clearEnd, clearWidth: Math.max(0, clearEnd - clearStart), plinthMm: item.kind !== 'fence' ? 0 : plinthBetween(left, right) });
    laidPosts[i].x = axisStart;
    x = axisEnd;
  });
  if (laidPosts.length > items.length) laidPosts[items.length].x = x;

  const totalModularMm = x;
  const first = posts[0]?.widthMm ?? 0;
  const last = posts[posts.length - 1]?.widthMm ?? 0;
  const maxHeightMm = Math.max(0, ...laidItems.map((l) => l.item.heightMm + l.plinthMm), ...posts.map((p) => p.heightMm));

  return {
    items: laidItems,
    posts: laidPosts,
    totalModularMm,
    occupiedMm: totalModularMm + (first + last) / 2,
    totalClearMm: laidItems.reduce((s, i) => s + i.clearWidth, 0),
    postCount: posts.length,
    sharedPostCount: Math.max(0, items.length - 1),
    naivePostCount: items.length * 2,
    maxHeightMm,
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
  return ((project.posts[index]?.widthMm ?? 0) + (project.posts[index + 1]?.widthMm ?? 0)) / 2;
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
