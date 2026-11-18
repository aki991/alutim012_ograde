import { fittingKind } from './materialCategory';
import { diasOfName, dimsFromName, materialShape, norm, type Solid } from './materialShape';
import type { Material } from './types';

const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const f = (v: number): string => String(Math.round(v * 1000) / 1000).replace('.', ',');
const volume = (s: Solid): number => {
  switch (s.prim) {
    case 'box': return s.size[0] * s.size[1] * s.size[2];
    case 'cyl': return Math.PI * s.r ** 2 * s.len;
    case 'pyr': return s.base[0] * s.base[1] * s.h / 3;
    case 'dome': return Math.PI * s.w * s.h * s.d / 4;
  }
};
const ring = (a: number, b: number, t: number): number => a * b - Math.max(0, a - 2 * t) * Math.max(0, b - 2 * t);

/** Zapremine gotovih komada: otvori i šupljine se oduzimaju, mere iz naziva su mere profila na koji deo ide. */
export function fittingVolumeEstimate(m: Material): { volumeMm3: number; reference: string } | null {
  const kind = fittingKind(m);
  if (kind !== 'ending' && kind !== 'mounting') return null;
  const n = norm(m.name); const dims = dimsFromName(m.name); const dias = diasOfName(m.name); const ov = m.dims ?? {};
  const a = ov.a ?? ov.width ?? dims[0] ?? dias[0] ?? (/dve maske|2 maske/.test(n) ? 79.6 : /jednu masku/.test(n) ? 30 : 60);
  const b = ov.b ?? ov.depth ?? dims[1] ?? (dias.length ? a : /dve maske|2 maske/.test(n) ? 26 : /jednu masku/.test(n) ? 25.8 : a);
  const t = positive(m.wallMm) ? m.wallMm : 3;
  const shellT = Math.min(t, Math.min(a, b) / 4);
  const pack = m.unit === 'set' && /levi i desni|leva i desna|\bpar\b/.test(n) ? 2 : 1;
  const result = (v: number, reference: string) => ({ volumeMm3: Math.max(1, v) * pack, reference: `${reference}; nepotvrđene debljine i visine su usvojene${pack > 1 ? '; masa celog seta od 2 komada' : ''}` });

  if (/ukrasna kugla/.test(n)) {
    const r = a / 2;
    return result(4 * Math.PI / 3 * (r ** 3 - Math.max(0, r - shellT) ** 3), `Šuplja ukrasna kugla Ø${f(a)}, zid ${f(shellT)} mm`);
  }
  if (/rozet|maska (?:flanse|stuba)|maskica stuba/.test(n)) {
    const wall = positive(m.wallMm) ? m.wallMm : 2; const height = ov.height ?? 16;
    if (dias.length) {
      const r = a / 2 + 22; const opening = a / 2 + 1;
      return result(Math.PI * (r * r - opening * opening) * wall + Math.PI * (r * r - (r - wall) ** 2) * height, `Šuplja okrugla rozeta za Ø${f(a)}; spolja Ø${f(2 * r)}, otvor Ø${f(2 * opening)}, visina ${f(height)}, zid ${f(wall)} mm`);
    }
    const w = a + 44; const d = b + 44;
    return result((w * d - (a + 2) * (b + 2)) * wall + ring(w, d, wall) * height, `Šuplja rozeta za ${f(a)}×${f(b)}; spolja ${f(w)}×${f(d)}, otvor ${f(a + 2)}×${f(b + 2)}, visina ${f(height)}, zid ${f(wall)} mm`);
  }
  if (/tarabic/.test(n)) {
    const height = ov.height ?? 0.425 * a;
    const outer = Math.PI * a * height * b / 4;
    const hollow = /suplj/.test(n);
    const inner = hollow ? Math.PI * Math.max(0, a - 2 * shellT) * Math.max(0, height - shellT) * Math.max(0, b - 2 * shellT) / 4 : 0;
    return result(outer - inner + (a + 4) * (b + 4) * (hollow ? shellT : 6), `Čep tarabice ${f(a)}×${f(b)}, zaobljen vrh visine ${f(height)} mm, ${hollow ? `šupljina sa zidom ${f(shellT)}` : 'pun odlivak'}, okovratnik ${hollow ? f(shellT) : '6'} mm`);
  }
  if (kind === 'ending') {
    const skirt = ov.skirt ?? 12;
    if (dias.length) {
      const r = a / 2 + 2;
      return result(Math.PI * r * r * shellT + Math.PI * (r * r - (r - shellT) ** 2) * skirt, `Završna kapa za Ø${f(a)}, zid ${f(shellT)}, rub ${f(skirt)} mm; oduzeta šupljina`);
    }
    if (/\bcep.*u profil/.test(n)) {
      return result(a * b * shellT + 2 * (a + b) * 1.5 * 8, `Čep U profila ${f(a)}×${f(b)}, čeona ploča ${f(shellT)} mm i montažni rub 1,5×8 mm`);
    }
    const w = a + 4; const d = b + 4;
    const pyramid = /pism[oa]|piramid|siljat/.test(n);
    const h = ov.height ?? Math.max(12, Math.min(a, b) * 0.28);
    const roof = pyramid ? w * Math.hypot(d / 2, h) + d * Math.hypot(w / 2, h) : w * d;
    return result((roof + 2 * (w + d) * skirt) * shellT, `${pyramid ? 'Šuplja kapa pismo' : 'Ravna završna kapa'} za ${f(a)}×${f(b)}, spolja ${f(w)}×${f(d)}, zid ${f(shellT)}, rub ${f(skirt)}${pyramid ? `, vrh ${f(h)}` : ''} mm; površina plašta × zid`);
  }
  if (/\bstop|flans|prirubnic/.test(n)) {
    const plateT = ov.plateT ?? 6; const collarH = ov.collarH ?? 70;
    if (dias.length) {
      const r = a / 2 + 30; const bore = a / 2; const outer = bore + 5;
      return result(Math.PI * (r * r - bore * bore) * plateT + Math.PI * (outer * outer - bore * bore) * collarH, `Okrugla flanša Ø${f(a + 60)}×${f(plateT)}, prolaz Ø${f(a)}, čaura Ø${f(a + 10)}×${f(collarH)} mm; oduzeti otvori`);
    }
    const plate = /bocn/.test(n) ? plateT * Math.max(90, a + 50) * (b + 40) : (a + 60) * (b + 60) * plateT;
    const collarLength = /bocn/.test(n) ? 60 : collarH;
    return result(plate + ((a + 6) * (b + 6) - a * b) * collarLength, `${/bocn/.test(n) ? 'Bočna' : 'Spoljna'} stopa za ${f(a)}×${f(b)}: ploča ${f(plateT)} mm, šuplja čaura zida 3 i dužine ${f(collarLength)} mm; otvor profila oduzet`);
  }
  const shape = materialShape(m);
  if (shape.type === 'piece') {
    // Prikaz je sklop punih tela; 35% zapremine odbijamo na kanale, provrte i preklapanja šematskog prikaza.
    return result(shape.solids.reduce((sum, s) => sum + volume(s), 0) * 0.65, 'Zapremina šematskog 3D dela × 65%; usvojeno 35% odbitka za otvore, kanale i preklapanja');
  }
  return result(a * b * 6 * 0.65, `Približan spojni deo ${f(a)}×${f(b)}×6 mm, 35% odbitka za otvore`);
}
