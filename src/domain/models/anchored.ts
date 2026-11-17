import { partBounds, type CustomModel, type CustomPart } from './custom';
import { applyGuides, shapeLookup } from './guides';
import type { Material } from './types';

/**
 * Model iz kataloga na polju druge veličine: delovi se NE razvlače srazmerno (ram bi menjao debljinu, nosači bi se pomerali, a
 * letvice bi se širile), nego svaka mera ostaje vezana za bližu ivicu polja, kao kod ugrađenog crteža:
 *  - ram i profili uz ivicu ostaju uz ivicu iste debljine, a prečke i letvice između njih se produžavaju do ramova;
 *  - nosač blizu dna ostaje na istom odstojanju od dna, a nosač blizu vrha na istom odstojanju od vrha;
 *  - komadni delovi (čepovi) i kosi profili se samo pomeraju.
 * Broj i razmak letvica i prečki zatim računaju `refillVBars` i `refillPattern`.
 */

const norm = (a: number): number => ((a % 360) + 360) % 360;
/** mera v u polju veličine v0 koje postaje veličine v1: uz početak ostaje, uz kraj ide sa krajem */
const anchor = (v: number, v0: number, v1: number): number => (v < v0 / 2 ? v : v + (v1 - v0));

export function anchoredModel(m: CustomModel, widthMm: number, heightMm: number, materials: Material[]): CustomModel {
  if (Math.abs(m.widthMm - widthMm) < 1e-9 && Math.abs(m.heightMm - heightMm) < 1e-9) return m;
  const shapeOf = shapeLookup(materials);
  const W0 = m.widthMm; const H0 = m.heightMm;
  const ax = (v: number) => anchor(v, W0, widthMm);
  const ay = (v: number) => anchor(v, H0, heightMm);
  const parts = m.parts.map((p): CustomPart => {
    const s = shapeOf(p);
    if (!s) return p;
    const b = partBounds(p, s);
    const cx = (b.x0 + b.x1) / 2; const cy = (b.y0 + b.y1) / 2;
    const a = norm(p.angleDeg);
    if (s.type === 'sheet') {
      const x0 = ax(b.x0); const x1 = ax(b.x1); const y0 = ay(b.y0); const y1 = ay(b.y1);
      return { ...p, x: x0, y: y0, lengthMm: x1 - x0, heightMm: y1 - y0 };
    }
    if (s.type === 'linear' && Math.abs(a - 90) < 1e-6) {
      const n0 = ay(Math.min(p.y, p.y + p.lengthMm)); const n1 = ay(Math.max(p.y, p.y + p.lengthMm));
      return { ...p, x: p.x + (ax(cx) - cx), y: n0, lengthMm: n1 - n0 };
    }
    if (s.type === 'linear' && Math.abs(a - 270) < 1e-6) {
      const n0 = ay(Math.min(p.y, p.y - p.lengthMm)); const n1 = ay(Math.max(p.y, p.y - p.lengthMm));
      return { ...p, x: p.x + (ax(cx) - cx), y: n1, lengthMm: n1 - n0 };
    }
    if (s.type === 'linear' && Math.abs(a) < 1e-6) {
      const n0 = ax(p.x); const n1 = ax(p.x + p.lengthMm);
      return { ...p, x: n0, y: p.y + (ay(cy) - cy), lengthMm: n1 - n0 };
    }
    if (s.type === 'linear' && Math.abs(a - 180) < 1e-6) {
      const n0 = ax(p.x - p.lengthMm); const n1 = ax(p.x);
      return { ...p, x: n1, y: p.y + (ay(cy) - cy), lengthMm: n1 - n0 };
    }
    return { ...p, x: p.x + (ax(cx) - cx), y: p.y + (ay(cy) - cy) };
  });
  return applyGuides({ ...m, widthMm, heightMm, parts }, materials);
}

/**
 * Dužina profila u specifikaciji za polje širine W i visine H kao formula: svaki kraj profila ostaje uz bližu ivicu, pa dužina raste
 * za razliku mera samo ako su krajevi sa raznih strana sredine (null za kose profile: važi srazmerno razvlačenje).
 */
export function anchoredLengthFormula(m: CustomModel, p: CustomPart): string | null {
  const a = norm(p.angleDeg);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const half = (v: number, v0: number) => (v >= v0 / 2 ? 1 : 0);
  let coef: number; let dim: string; let v0: number;
  if (a === 0 || a === 180) { const x0 = Math.min(p.x, p.x + (a === 0 ? p.lengthMm : -p.lengthMm)); coef = half(x0 + p.lengthMm, m.widthMm) - half(x0, m.widthMm); dim = 'W'; v0 = m.widthMm; }
  else if (a === 90 || a === 270) { const y0 = Math.min(p.y, p.y + (a === 90 ? p.lengthMm : -p.lengthMm)); coef = half(y0 + p.lengthMm, m.heightMm) - half(y0, m.heightMm); dim = 'H'; v0 = m.heightMm; }
  else return null;
  return coef ? `${r1(p.lengthMm)}+${coef}*(${dim}-${v0})` : String(r1(p.lengthMm));
}
