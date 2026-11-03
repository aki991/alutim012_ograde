import { computeInfill } from '../domain/geometry/infill';
import { computeLayout, outerWidthMm } from '../domain/geometry/layout';
import type { Project } from '../domain/models/types';
import { itemLabel } from '../utils/labels';

/** Shema ograde za radni nalog: svaki element u boji svoje pozicije (kao na krojnoj listi), sa oznakom, nazivom i merom. */

const FONT = 'Arial, Helvetica, sans-serif';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const SCHEMA_W = 1000;

export function schemaSvg(project: Project, keyOfItem: (index: number) => string | null, colors: Map<string, string>): { svg: string; width: number; height: number } {
  const layout = computeLayout(project);
  const W = SCHEMA_W;
  const padX = 14;
  const topPad = 44; // mesto za oznake iznad
  const botPad = 40; // zemlja i ukupna mera
  const maxPost = Math.max(0, ...project.posts.map((p) => p.widthMm));
  const totalMm = Math.max(1, layout.totalModularMm + maxPost);
  const maxH = Math.max(1, layout.maxHeightMm, ...project.posts.map((p) => p.heightMm));
  const s = Math.min((W - 2 * padX) / totalMm, 230 / maxH);
  const drawW = totalMm * s;
  const ox = (W - drawW) / 2 + (maxPost * s) / 2; // x nule (osa prvog stuba)
  const H = Math.round(maxH * s + topPad + botPad);
  const ground = topPad + maxH * s;
  const out: string[] = [];
  out.push(`<line x1="${padX}" y1="${ground}" x2="${W - padX}" y2="${ground}" stroke="#94a3b8" stroke-width="1.5"/>`);

  for (const li of layout.items) {
    const it = li.item;
    const x = ox + li.axisStart * s;
    const w = (li.axisEnd - li.axisStart) * s;
    if (it.kind === 'opening') {
      out.push(`<rect x="${x.toFixed(1)}" y="${(ground - it.heightMm * s).toFixed(1)}" width="${w.toFixed(1)}" height="${(it.heightMm * s).toFixed(1)}" fill="none" stroke="#cbd5e1" stroke-dasharray="4 4"/>`);
      continue;
    }
    const key = keyOfItem(li.index);
    const color = (key && colors.get(key)) || '#475569';
    const h = it.heightMm * s;
    const y = ground - h;
    out.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" fill-opacity="0.14" stroke="${color}" stroke-width="2"/>`);
    // ispuna iz istog proračuna kao crtež
    const modelId = it.kind === 'fence' ? it.modelId : it.infillModelId;
    const geo = computeInfill(modelId, li.clearWidth, it.heightMm, it.params.frameMm, it.params.barSizeMm, it.params.gapMm, it.params.barCount);
    const ix = ox + li.clearStart * s;
    for (const b of geo.bars) {
      out.push(`<rect x="${(ix + b.x * s).toFixed(1)}" y="${(y + b.y * s).toFixed(1)}" width="${Math.max(0.8, b.w * s).toFixed(1)}" height="${Math.max(0.8, b.h * s).toFixed(1)}" fill="${color}" fill-opacity="0.55"/>`);
    }
    if (it.kind === 'gate') out.push(`<line x1="${x.toFixed(1)}" y1="${(y + h).toFixed(1)}" x2="${(x + w).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${color}" stroke-width="1.2" stroke-dasharray="6 5" opacity="0.8"/>`);
    // oznaka pozicije iznad elementa
    const tag = key ? (/^\d/.test(key) ? `P${key}` : key) : '';
    const cx = x + w / 2;
    if (tag) {
      const tw = Math.max(28, tag.length * 9 + 14);
      out.push(`<rect x="${(cx - tw / 2).toFixed(1)}" y="6" width="${tw}" height="22" rx="11" fill="${color}"/>`);
      out.push(`<text x="${cx.toFixed(1)}" y="21.5" text-anchor="middle" font-family="${FONT}" font-size="14" font-weight="700" fill="#fff">${esc(tag)}</text>`);
    }
    // naziv i mera na elementu
    const name = itemLabel(project.items, li.index);
    const dim = `${Math.round(outerWidthMm(project, li.index))} × ${Math.round(it.heightMm)}`;
    const fsName = Math.max(8, Math.min(14, (w - 10) / (name.length * 0.58)));
    const fsDim = Math.max(8, Math.min(12, (w - 10) / (dim.length * 0.58)));
    const ty = y + h / 2;
    out.push(`<rect x="${(x + 4).toFixed(1)}" y="${(ty - 20).toFixed(1)}" width="${Math.max(0, w - 8).toFixed(1)}" height="38" rx="4" fill="#fff" fill-opacity="0.88"/>`);
    out.push(`<text x="${cx.toFixed(1)}" y="${(ty - 4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${fsName.toFixed(1)}" font-weight="700" fill="#1a1a1a">${esc(name)}</text>`);
    out.push(`<text x="${cx.toFixed(1)}" y="${(ty + 12).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${fsDim.toFixed(1)}" fill="#475569">${esc(dim)}</text>`);
  }

  // stubovi preko elemenata
  for (const lp of layout.posts) {
    const w = Math.max(3, lp.post.widthMm * s);
    const h = lp.post.heightMm * s;
    const x = ox + lp.x * s - w / 2;
    out.push(`<rect x="${x.toFixed(1)}" y="${(ground - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="#1f2933"/>`);
    out.push(`<text x="${(x + w / 2).toFixed(1)}" y="${(ground + 15).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="700" fill="#475569">S${lp.index + 1}</text>`);
  }
  // ukupna zauzeta dužina
  const y0 = ground + 28;
  out.push(`<line x1="${(ox - maxPost * s / 2).toFixed(1)}" y1="${y0}" x2="${(ox + (layout.totalModularMm + maxPost / 2) * s).toFixed(1)}" y2="${y0}" stroke="#94a3b8" stroke-width="1"/>`);
  out.push(`<text x="${(W / 2).toFixed(1)}" y="${(y0 + 11).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="#475569">ukupna dužina ${Math.round(layout.occupiedMm)} mm</text>`);

  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${out.join('')}</svg>`, width: W, height: H };
}
