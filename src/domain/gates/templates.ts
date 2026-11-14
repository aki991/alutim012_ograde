import { DIM_BY_KEY, type DimValue, type GateDesign, type GateSystem } from './design';

/**
 * Šabloni ALU TIM-a: kompletna kapija ili ponovljiv detalj (montaža šarke, spoj ispune, raspored kolica). Radnik bira šta
 * šablon prenosi. Svaka „nova verzija“ se dodaje uz prethodne; posao čuva svoje konačne vrednosti i broj verzije koju je primenio,
 * pa kasnija izmena šablona ne menja sačuvane poslove dok je radnik svesno ne primeni.
 */

export interface TemplateInclude {
  /** ponovljive kote (zazori, prepusti, rep, kolica, okovi …) bez terenskih mera */
  dims: boolean;
  /** koja kota se računa u svakoj jednačini */
  rules: boolean;
  /** okovi, profili, način izrade, ručne rezne mere */
  parts: boolean;
  /** dodatne imenovane kote */
  extra: boolean;
  /** terenske mere (terenske širine, kote, bočni prostor) — samo kad se namerno kopira ceo primer */
  field: boolean;
}

export interface GateTemplateVersion {
  version: number;
  savedAt: string;
  by: string;
  note?: string;
  include: TemplateInclude;
  data: Partial<GateDesign>;
}

export interface GateTemplate {
  id: string;
  name: string;
  scope: 'gate' | 'detail';
  system?: GateSystem;
  versions: GateTemplateVersion[];
}

/** kote koje su terenske (vezane za konkretno mesto), ne ponovljiva podešavanja */
export const FIELD_KEYS = ['W', 'wTop', 'wMid', 'wBot', 'ground', 'slope', 'P', 'H'];

export const DEFAULT_INCLUDE: TemplateInclude = { dims: true, rules: true, parts: true, extra: true, field: false };

export function snapshot(d: GateDesign, inc: TemplateInclude): Partial<GateDesign> {
  const out: Partial<GateDesign> = {};
  if (inc.dims || inc.field) {
    const dims: Record<string, DimValue> = {};
    for (const [k, x] of Object.entries(d.dims)) {
      if (x.v === null || !DIM_BY_KEY[k]) continue;
      const field = FIELD_KEYS.includes(k);
      if ((field && inc.field) || (!field && inc.dims)) dims[k] = { v: x.v, origin: 'sablon' };
    }
    out.dims = dims;
  }
  if (inc.rules) out.solve = { ...d.solve };
  if (inc.parts) {
    out.hardware = d.hardware.map((h) => ({ ...h }));
    out.profiles = d.profiles.map((p) => ({ ...p }));
    out.build = d.build;
    out.slide = d.slide;
    out.cuts = { ...d.cuts };
    out.overlap = d.overlap;
    out.activeLeaf = d.activeLeaf;
  }
  if (inc.extra) out.extra = d.extra.map((x) => ({ ...x }));
  return out;
}

/** primena verzije šablona na posao: prenete kote dobijaju poreklo „šablon“, zavisne kote se ponovo računaju */
export function applyTemplate(d: GateDesign, tpl: GateTemplate, ver: GateTemplateVersion): GateDesign {
  const s = ver.data;
  const next: GateDesign = { ...d, template: { id: tpl.id, name: tpl.name, version: ver.version } };
  if (s.dims) {
    const dims = { ...d.dims };
    for (const [k, x] of Object.entries(s.dims)) dims[k] = { v: x.v, origin: 'sablon', status: 'radna' };
    next.dims = dims;
  }
  if (s.solve) next.solve = { ...d.solve, ...s.solve };
  if (s.hardware) next.hardware = s.hardware.map((h) => ({ ...h }));
  if (s.profiles) next.profiles = s.profiles.map((p) => ({ ...p }));
  if (s.cuts) next.cuts = { ...s.cuts };
  if (s.build !== undefined) next.build = s.build;
  if (s.slide !== undefined) next.slide = s.slide;
  if (s.overlap !== undefined) next.overlap = s.overlap;
  if (s.activeLeaf !== undefined) next.activeLeaf = s.activeLeaf;
  if (s.extra) next.extra = s.extra.map((x) => ({ ...x }));
  return next;
}

export function latest(t: GateTemplate): GateTemplateVersion {
  return t.versions.reduce((a, b) => (b.version > a.version ? b : a));
}

export function newTemplate(id: string, name: string, scope: 'gate' | 'detail', system: GateSystem | undefined, d: GateDesign, inc: TemplateInclude, by: string, note?: string): GateTemplate {
  return { id, name, scope, system, versions: [{ version: 1, savedAt: new Date().toISOString(), by, note, include: inc, data: snapshot(d, inc) }] };
}

export function addVersion(t: GateTemplate, d: GateDesign, inc: TemplateInclude, by: string, note?: string): GateTemplate {
  const version = Math.max(...t.versions.map((v) => v.version)) + 1;
  return { ...t, versions: [...t.versions, { version, savedAt: new Date().toISOString(), by, note, include: inc, data: snapshot(d, inc) }] };
}

export function describeInclude(inc: TemplateInclude): string {
  return [inc.dims && 'kote', inc.rules && 'pravila proračuna', inc.parts && 'delovi i okovi', inc.extra && 'dodatne kote', inc.field && 'terenske mere'].filter(Boolean).join(', ') || 'ništa';
}
