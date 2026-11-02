import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { FrontView, frontViewMetrics } from '../components/editor/FrontView';
import type { Project } from '../domain/models/types';
import { serializeProject } from '../domain/validation/project';

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const safeFilename = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'dj').replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/^_+|_+$/g, '') || 'projekat';

export function exportProjectJson(p: Project): void {
  downloadBlob(new Blob([serializeProject(p)], { type: 'application/json' }), `${safeFilename(p.name)}.json`);
}

/** SVG string crteža spreda (bez interaktivnih elemenata) u razumnim dimenzijama (0,08 px/mm). */
export function frontViewSvgString(project: Project, scale = 0.08): string {
  const svg = renderToStaticMarkup(createElement(FrontView, { project, scale, options: { showGrid: false } }));
  return svg;
}

export async function exportSvg(p: Project): Promise<void> {
  const svg = await inlineSvgImages(frontViewSvgString(p, 0.1));
  downloadBlob(new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`], { type: 'image/svg+xml' }), `${safeFilename(p.name)}.svg`);
}

/** Slike u SVG-u (ispune polja iz kataloga) učitane kao spoljni fajlovi ne prikazuju se kad se SVG crta kao slika: ugrađuju se kao data URL. */
async function inlineSvgImages(svg: string): Promise<string> {
  const urls = [...new Set([...svg.matchAll(/href="([^"#][^"]*)"/g)].map((m) => m[1]).filter((u) => !u.startsWith('data:')))];
  const map = new Map<string, string>();
  await Promise.all(urls.map(async (raw) => {
    try {
      const res = await fetch(raw.replace(/&amp;/g, '&'));
      if (!res.ok) return;
      const blob = await res.blob();
      const data = await new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => bad(r.error); r.readAsDataURL(blob); });
      map.set(raw, data);
    } catch { /* slika se preskače, ostatak crteža ostaje */ }
  }));
  return svg.replace(/href="([^"#][^"]*)"/g, (all, u: string) => (map.has(u) ? `href="${map.get(u)}"` : all));
}

/**
 * Ograda bez pozadine i tla, isečena tačno po ivicama (od spoljne ivice prvog do spoljne ivice poslednjeg stuba, od tla do vrha),
 * kao SVG data URL sa ugrađenim slikama ispune — za simulaciju na fotografiji. Vraća i odnos širine i visine.
 */
export async function fenceOverlay(project: Project): Promise<{ url: string; aspect: number }> {
  const scale = 0.1;
  const m = frontViewMetrics(project, scale, false);
  const x0 = -m.firstW / 2;
  const x1 = m.layout.occupiedMm - m.firstW / 2;
  const top = m.groundY - m.layout.maxHeightMm - 60; // kape stubova
  const w = x1 - x0;
  const h = m.groundY - top;
  let svg = renderToStaticMarkup(createElement(FrontView, { project, scale, options: { showGrid: false, showDimensions: false, showLabels: false, transparent: true } }));
  svg = svg.replace(/^<svg([^>]*)>/, (_all, attrs: string) => `<svg${attrs.replace(/\s(viewBox|width|height)="[^"]*"/g, '')} viewBox="${x0} ${top} ${w} ${h}" width="${Math.round(w * 0.4)}" height="${Math.round(h * 0.4)}" preserveAspectRatio="none">`);
  svg = await inlineSvgImages(svg);
  return { url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, aspect: w / h };
}

/** Pretvara crtež u PNG data URL (za PDF). */
export async function frontViewPng(project: Project, targetWidthPx = 1400): Promise<{ dataUrl: string; width: number; height: number }> {
  const baseScale = 0.12;
  const m = frontViewMetrics(project, baseScale, project.settings.showDimensions);
  const scale = targetWidthPx / m.vw / 1;
  const mm = frontViewMetrics(project, scale, project.settings.showDimensions);
  const svg = await inlineSvgImages(frontViewSvgString(project, scale));
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Crtež nije moguće pretvoriti u sliku.')); img.src = url; });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(mm.widthPx);
  canvas.height = Math.round(mm.heightPx);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}

export function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
}

export function downloadCsv(rows: (string | number)[][], filename: string): void {
  downloadBlob(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }), filename);
}
