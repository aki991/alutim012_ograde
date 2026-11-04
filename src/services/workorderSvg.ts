import { computeInfill } from '../domain/geometry/infill';
import { computeLayout, isSpacer, outerWidthMm } from '../domain/geometry/layout';
import type { Project } from '../domain/models/types';
import { itemLabel } from '../utils/labels';

/**
 * Shema ograde za radni nalog: svaki element u boji svoje pozicije (kao na krojnoj listi), sa oznakom, nazivom i merom.
 * Elementi stoje na stvarnoj visini (ograda na podnožju, kapija na zemlji), pa su vrhovi poravnati kao na pravom prikazu;
 * samo podnožje se ne crta. Uski elementi imaju naziv okrenut uspravno, oznaka stuba stoji odmah ispod stuba, a oznake se po
 * potrebi pomeraju u sledeći red da se ne preklapaju.
 */

const FONT = 'Arial, Helvetica, sans-serif';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const SCHEMA_W = 1000;

interface Mark { x: number; w: number }

/** Raspoređuje oznake po redovima tako da se u istom redu ne preklapaju; vraća red (0, 1, 2 …) svake oznake. */
function allocateRows(marks: Mark[], gap = 4): number[] {
  const order = marks.map((_, i) => i).sort((a, b) => marks[a].x - marks[b].x);
  const lastRight: number[] = [];
  const rows = new Array<number>(marks.length).fill(0);
  for (const i of order) {
    const m = marks[i];
    let r = 0;
    while (r < lastRight.length && m.x - m.w / 2 < lastRight[r] + gap) r += 1;
    lastRight[r] = m.x + m.w / 2;
    rows[i] = r;
  }
  return rows;
}

export function schemaSvg(project: Project, keyOfItem: (index: number) => string | null, colors: Map<string, string>): { svg: string; width: number; height: number } {
  const layout = computeLayout(project);
  const W = SCHEMA_W;
  const padX = 14;
  const real = layout.items.filter((li) => !isSpacer(li.item));
  const solid = real.filter((li) => li.item.kind !== 'opening');
  const visiblePosts = layout.posts.filter((lp) => !lp.hidden);
  const maxPost = Math.max(0, ...project.posts.map((p) => p.widthMm));
  const totalMm = Math.max(1, layout.totalModularMm + maxPost);

  // stvarna visina: ograda stoji na svom podnožju (koje se ne crta), kapija i otvor na zemlji; posle stepeništa na novom nivou
  const baseOf = (li: (typeof real)[number]) => li.floorStart + (li.item.kind === 'fence' ? li.plinthMm : 0);
  const riseOf = (li: (typeof real)[number]) => li.floorEnd - li.floorStart;
  const postTopOf = (lp: (typeof visiblePosts)[number]) => lp.floorMm + lp.topMm;
  const maxH = Math.max(1, ...real.map((li) => baseOf(li) + Math.max(0, riseOf(li)) + li.item.heightMm), ...visiblePosts.map(postTopOf));
  const s = Math.min((W - 2 * padX) / totalMm, 230 / maxH);
  const drawW = totalMm * s;
  const ox = (W - drawW) / 2 + (maxPost * s) / 2; // x nule (osa prvog stuba)

  // oznake pozicija iznad elemenata: redovi bez preklapanja
  const tags = solid.map((li) => {
    const key = keyOfItem(li.index);
    const text = key ? (/^\d/.test(key) ? `P${key}` : key) : '';
    return { li, key, text, x: ox + ((li.axisStart + li.axisEnd) / 2) * s, w: Math.max(28, text.length * 9 + 14) };
  });
  const tagRows = allocateRows(tags.map((t) => ({ x: t.x, w: t.w })), 4);
  const tagRowCount = Math.max(1, ...tagRows.map((r) => r + 1));
  const topPad = 12 + tagRowCount * 26 + 4;
  const ground = topPad + maxH * s;

  // oznake stubova odmah ispod dna stuba; ako bi prešle preko susednog stuba, elementa ili druge oznake, spuštaju se red niže
  type Box = { x0: number; x1: number; y0: number; y1: number };
  const blocked: Box[] = [
    ...visiblePosts.map((lp) => { const hw = Math.max(4, lp.post.widthMm * s) / 2; const x = ox + (lp.x + lp.shiftMm) * s; return { x0: x - hw, x1: x + hw, y0: ground - postTopOf(lp) * s, y1: ground - (lp.floorMm + lp.baseMm) * s }; }),
    ...solid.map((li) => ({ x0: ox + li.axisStart * s, x1: ox + li.axisEnd * s, y0: ground - (baseOf(li) + Math.max(0, riseOf(li)) + li.item.heightMm) * s, y1: ground - (baseOf(li) + Math.min(0, riseOf(li))) * s })),
  ];
  const hits = (b: Box) => blocked.some((q) => b.x0 < q.x1 + 1 && b.x1 > q.x0 - 1 && b.y0 < q.y1 + 1 && b.y1 > q.y0 - 1);
  const postLabels = visiblePosts.map((lp, k) => {
    const text = `S${lp.index + 1}`;
    const x = ox + (lp.x + lp.shiftMm) * s;
    const tw = text.length * 6.6 + 2;
    const hw = Math.max(4, lp.post.widthMm * s) / 2;
    const bottom = ground - (lp.floorMm + lp.baseMm) * s;
    // ispod stuba: po sredini, pa poravnato uz desnu ili levu ivicu stuba (kad je susedni stub odmah do njega), pa red niže
    const mid = { anchor: 'middle' as const, tx: x, x0: x - tw / 2 };
    const end = { anchor: 'end' as const, tx: x + hw, x0: x + hw - tw };
    const start = { anchor: 'start' as const, tx: x - hw, x0: x - hw };
    // par stubova jedan do drugog: levi dobija oznaku levo, desni desno
    const near = (o?: (typeof visiblePosts)[number]) => o !== undefined && Math.abs(ox + o.x * s - x) < tw + 2 * hw;
    const options = near(visiblePosts[k + 1]) ? [end, mid, start] : near(visiblePosts[k - 1]) ? [start, mid, end] : [mid, end, start];
    for (let y = bottom + 12; ; y += 13) {
      const o = options.find((c) => !hits({ x0: c.x0, x1: c.x0 + tw, y0: y - 10, y1: y + 2 }));
      if (o) {
        blocked.push({ x0: o.x0, x1: o.x0 + tw, y0: y - 10, y1: y + 2 });
        return { text, x, tx: o.tx, anchor: o.anchor, y, bottom };
      }
    }
  });
  const lowest = Math.max(ground, ...postLabels.map((p) => p.y));
  const H = Math.round(lowest + 34);
  const out: string[] = [];

  for (const li of real) {
    const it = li.item;
    const x = ox + li.axisStart * s;
    const w = (li.axisEnd - li.axisStart) * s;
    if (it.kind === 'opening') {
      out.push(`<rect x="${x.toFixed(1)}" y="${(ground - (li.floorStart + it.heightMm) * s).toFixed(1)}" width="${w.toFixed(1)}" height="${(it.heightMm * s).toFixed(1)}" fill="none" stroke="#cbd5e1" stroke-dasharray="4 4"/>`);
      continue;
    }
    const key = keyOfItem(li.index);
    const color = (key && colors.get(key)) || '#475569';
    const h = it.heightMm * s;
    const y = ground - baseOf(li) * s - h;
    // stepenište: element se iskosi (vertikale ostaju vertikalne)
    const t = li.axisEnd > li.axisStart ? riseOf(li) / (li.axisEnd - li.axisStart) : 0;
    if (t) out.push(`<g transform="matrix(1 ${(-t).toFixed(5)} 0 1 0 ${(t * x).toFixed(2)})">`);
    out.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" fill-opacity="0.14" stroke="${color}" stroke-width="2"/>`);
    // ispuna iz istog proračuna kao crtež
    const modelId = it.kind === 'fence' ? it.modelId : it.infillModelId;
    const geo = computeInfill(modelId, li.clearWidth, it.heightMm, it.params.frameMm, it.params.barSizeMm, it.params.gapMm, it.params.barCount, it.params.liftMm);
    const ix = ox + li.clearStart * s;
    for (const b of geo.bars) {
      out.push(`<rect x="${(ix + b.x * s).toFixed(1)}" y="${(y + b.y * s).toFixed(1)}" width="${Math.max(0.8, b.w * s).toFixed(1)}" height="${Math.max(0.8, b.h * s).toFixed(1)}" fill="${color}" fill-opacity="0.55"/>`);
    }
    if (it.kind === 'gate') out.push(`<line x1="${x.toFixed(1)}" y1="${(y + h).toFixed(1)}" x2="${(x + w).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${color}" stroke-width="1.2" stroke-dasharray="6 5" opacity="0.8"/>`);
    if (t) out.push('</g>');

    // naziv i mera na elementu: vodoravno ako staje, inače uspravno
    const name = itemLabel(project.items, li.index);
    const dim = `${Math.round(outerWidthMm(project, li.index))} × ${Math.round(it.heightMm)}`;
    const cx = x + w / 2;
    const ty = y + h / 2 - t * (w / 2);
    const needW = Math.max(name.length * 7.6, dim.length * 6.4) + 12;
    if (w >= needW) {
      const fsName = Math.max(10, Math.min(15, (w - 12) / (name.length * 0.6)));
      const fsDim = Math.max(9, Math.min(12.5, (w - 12) / (dim.length * 0.58)));
      out.push(`<rect x="${(x + 4).toFixed(1)}" y="${(ty - 20).toFixed(1)}" width="${Math.max(0, w - 8).toFixed(1)}" height="38" rx="4" fill="#fff" fill-opacity="0.9"/>`);
      out.push(`<text x="${cx.toFixed(1)}" y="${(ty - 4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${fsName.toFixed(1)}" font-weight="700" fill="#1a1a1a">${esc(name)}</text>`);
      out.push(`<text x="${cx.toFixed(1)}" y="${(ty + 12).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${fsDim.toFixed(1)}" fill="#475569">${esc(dim)}</text>`);
    } else {
      // uzak element: naziv i mera okrenuti uspravno (čitaju se odozdo naviše)
      const vFs = Math.max(8, Math.min(12.5, (h - 16) / (Math.max(name.length, dim.length) * 0.62)));
      const lw = Math.min(h - 8, Math.max(name.length, dim.length) * vFs * 0.62 + 10);
      const lh = Math.min(w - 4, vFs * 2.6);
      out.push(`<g transform="translate(${cx.toFixed(1)} ${ty.toFixed(1)}) rotate(-90)">`
        + `<rect x="${(-lw / 2).toFixed(1)}" y="${(-lh / 2).toFixed(1)}" width="${lw.toFixed(1)}" height="${lh.toFixed(1)}" rx="3" fill="#fff" fill-opacity="0.92"/>`
        + `<text x="0" y="${(-vFs * 0.15).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${vFs.toFixed(1)}" font-weight="700" fill="#1a1a1a">${esc(name)}</text>`
        + `<text x="0" y="${(vFs * 1.05).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${(vFs * 0.88).toFixed(1)}" fill="#475569">${esc(dim)}</text>`
        + `</g>`);
    }
  }

  // oznake pozicija iznad elemenata (u više redova ako su uski elementi jedan do drugog)
  tags.forEach((t, i) => {
    if (!t.text) return;
    const color = (t.key && colors.get(t.key)) || '#475569';
    const ty = 6 + tagRows[i] * 26;
    out.push(`<rect x="${(t.x - t.w / 2).toFixed(1)}" y="${ty}" width="${t.w}" height="22" rx="11" fill="${color}"/>`);
    out.push(`<text x="${t.x.toFixed(1)}" y="${(ty + 15.5).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="14" font-weight="700" fill="#fff">${esc(t.text)}</text>`);
    if (tagRows[i] > 0) {
      const top = ground - (baseOf(t.li) + Math.max(0, riseOf(t.li))) * s - t.li.item.heightMm * s;
      out.push(`<line x1="${t.x.toFixed(1)}" y1="${ty + 22}" x2="${t.x.toFixed(1)}" y2="${top.toFixed(1)}" stroke="${color}" stroke-width="1" stroke-dasharray="2 2"/>`);
    }
  });

  // stubovi preko elemenata: od mesta na kome stoje do vrha
  for (const lp of visiblePosts) {
    const w = Math.max(4, lp.post.widthMm * s);
    const x = ox + (lp.x + lp.shiftMm) * s - w / 2;
    const bottom = ground - (lp.floorMm + lp.baseMm) * s;
    const top = ground - postTopOf(lp) * s;
    out.push(`<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${(bottom - top).toFixed(1)}" fill="#1f2933"/>`);
  }
  for (const p of postLabels) {
    out.push(`<text x="${p.tx.toFixed(1)}" y="${p.y.toFixed(1)}" text-anchor="${p.anchor}" font-family="${FONT}" font-size="11" font-weight="700" fill="#475569">${p.text}</text>`);
    if (p.y - p.bottom > 13) out.push(`<line x1="${p.x.toFixed(1)}" y1="${(p.bottom + 2).toFixed(1)}" x2="${p.x.toFixed(1)}" y2="${(p.y - 10).toFixed(1)}" stroke="#94a3b8" stroke-width="0.8"/>`);
  }

  // ukupna zauzeta dužina
  const y0 = lowest + 10;
  out.push(`<line x1="${(ox - maxPost * s / 2).toFixed(1)}" y1="${y0.toFixed(1)}" x2="${(ox + (layout.totalModularMm + maxPost / 2) * s).toFixed(1)}" y2="${y0.toFixed(1)}" stroke="#94a3b8" stroke-width="1"/>`);
  out.push(`<text x="${(W / 2).toFixed(1)}" y="${(y0 + 13).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11.5" fill="#475569">ukupna dužina ${Math.round(layout.occupiedMm)} mm</text>`);

  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${out.join('')}</svg>`, width: W, height: H };
}
