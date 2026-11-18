import { dimsFromName, materialShape, norm } from './materialShape';
import { profileSpecFor } from './profileDrawings';
import type { Material, MaterialMassUnit } from './types';
import { fittingVolumeEstimate } from './fittingMassEstimate';

export const ALUMINIUM_DENSITY_SOURCE = 'https://www.malco.co.jp/en/summary/character.html';
type Result = { mass: number; massUnit: MaterialMassUnit; massSource: 'calculated' | 'estimated'; massReference: string };
const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const area = (p: [number, number][]): number => Math.abs(p.reduce((s, [x, y], i) => { const q = p[(i + 1) % p.length]; return s + x * q[1] - q[0] * y; }, 0)) / 2;
const shell = (a: number, b: number, t: number): number => a * b - Math.max(0, a - 2 * t) * Math.max(0, b - 2 * t);
const show = (n: number): string => String(n).replace('.', ',');

/** Pretpostavke su uz rezultat, nikada se ne upisuju kao stvarne mere materijala/crteža. */
export function geometryMaterialMass(m: Material): Result {
  const n = norm(m.name);
  const d = dimsFromName(m.name);
  const ov = m.dims ?? {};
  const shape = materialShape(m);
  let density = 2700;
  let densityNote = `Aluminijum 2700 kg/m³ (${ALUMINIUM_DENSITY_SOURCE})`;
  let estimated = false;
  const notes: string[] = [];
  if (/inox|nerdjaj/.test(n) && !/alumin/.test(n)) {
    density = 7900; estimated = true;
    densityNote = 'Inox: usvojeno 7900 kg/m³; https://www.outokumpu.com/-/media/files/products/supra/outokumpu-supra-range-datasheet.pdf';
  } else if (/beton/.test(n)) {
    density = 2400; estimated = true;
    densityNote = 'Beton: usvojeno 2400 kg/m³; https://eurocodes.jrc.ec.europa.eu/sites/default/files/2021-12/handbook3.pdf';
  } else if (/epdm|gumen/.test(n)) {
    density = 1200; estimated = true;
    densityNote = 'EPDM/guma: približno 1200 kg/m³ (zavisi od smeše); https://www.trelleborg.com/seals/-/media/tss-media-repository/tss_website/pdf-and-other-literature/brochures/pool_water_epdm_en.pdf';
  } else if (/plastic|plastik|\bpe-hd\b|\bhdpe\b/.test(n)) {
    density = 950; estimated = true;
    densityNote = 'Plastika: usvojen PE-HD, približno 950 kg/m³; sastav nije potvrđen; https://www.roechling.com/uk/industrial/materials/thermoplastics/industrial-plastics/pe/pe-hd-pe-500/robaflow-709731';
  } else if (/inox|celic|gvozd|plastik|\bpvc\b|\bwpc\b|\bhpl\b/.test(n)) {
    // Nejasan/složen materijal se računa kao aluminijumski ekvivalent, vidljivo označen.
    estimated = true; notes.push('Sastav nije potvrđen; aluminijumski ekvivalent');
  }
  const finish = (sectionMm2: number, unit: MaterialMassUnit, reason: string, lengthMm?: number): Result => ({
    mass: sectionMm2 * density / 1e6 * (lengthMm === undefined ? 1 : lengthMm / 1000),
    massUnit: unit, massSource: estimated ? 'estimated' : 'calculated',
    massReference: `${estimated ? 'Procena' : 'Nominalno'}: ${reason}. ${notes.join('; ')}${notes.length ? '. ' : ''}${densityNote}`,
  });
  const fitting = fittingVolumeEstimate(m);
  if (fitting) return {
    mass: fitting.volumeMm3 * density / 1e9, massUnit: 'kg/kom', massSource: 'estimated',
    massReference: `Procena: ${fitting.reference}. ${densityNote}. Oblik: ${/^K100\d+$/i.test(m.sku) ? 'https://ekoluka.rs/katalog-alu-ograde.pdf (štampana str. 21)' : 'https://www.blecha.at/en/products/fencing-systems/posts-and-installation-materials/'}; nije potvrđena kataloška masa ovog artikla`,
  };
  const thickness = /debljin[ae]?\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(?:mm)?\b/i.exec(m.name)
    ?? /(?:lim|plo[čc]a)\s+(\d+(?:[.,]\d+)?)\s*mm\b/i.exec(m.name);
  if (m.unit === 'm2' || shape.type === 'sheet') {
    let t = ov.t ?? m.wallMm ?? d[2] ?? (thickness ? Number(thickness[1].replace(',', '.')) : undefined);
    if (!valid(t)) { t = /beton/.test(n) ? 50 : 2; estimated = true; notes.push(`Usvojena debljina ${show(t)} mm`); }
    let factor = 1;
    if (/perfor|lasers|rezan/.test(n)) { factor = 0.6; estimated = true; notes.push('Usvojeno 60% pune površine (40% otvora)'); }
    if (/rebrast|profilisan|sendvic|kompozit/.test(n)) { estimated = true; notes.push('Aproksimacija ravnom pločom iste debljine'); }
    if (m.unit !== 'm2') {
      estimated = true;
      const w = ov.width ?? d[0] ?? 1000; const h = ov.height ?? d[1] ?? 1000;
      notes.push(`Komad ${show(w)}×${show(h)} mm; nepotvrđene mere su usvojene`);
      return finish(t * w * factor, 'kg/kom', `Ploča ${show(t)} mm`, h);
    }
    return finish(t * 1000 * factor, 'kg/m²', `Ploča ${show(t)} mm × gustina`);
  }

  // Gotovi stubovi/komadi: masa se odnosi na čitav komad, ne na metar pretpostavljene šipke.
  const finishedPiece = m.unit === 'kom' && (m.category === 'stub' || /gotov|komad/.test(n)) && !/profil|cev|lamel|letvic/.test(n);
  if (finishedPiece || /beton/.test(n)) {
    estimated = true;
    const height = /(?:visin[ae]?|du[zž]in[ae]?)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*mm/i.exec(m.name)
      ?? /gotov\w*\s+(\d+(?:[.,]\d+)?)\s*mm/i.exec(m.name);
    const length = ov.lengthMm ?? ov.length ?? (height ? Number(height[1].replace(',', '.')) : undefined) ?? (/beton/.test(n) ? d[2] : undefined) ?? 2000;
    const a = ov.a ?? d[0] ?? (/beton/.test(n) ? 120 : /kapij|dekor/.test(n) ? 100 : 80);
    const b = ov.b ?? d[1] ?? a;
    const t = m.wallMm ?? d[2] ?? (/kapij/.test(n) ? 3 : 2);
    notes.push(`Usvojen komad ${show(a)}×${show(b)}×${show(length)} mm${density === 2400 ? ', pun presek' : `, zid ${show(t)} mm`}; nepotvrđene mere su pretpostavke`);
    return finish(density === 2400 ? a * b : shell(a, b, t), 'kg/kom', 'Presek × dužina × gustina', length);
  }

  if (shape.type === 'linear') {
    const spec = profileSpecFor(m);
    const hasSize = d.length >= 2 || valid(ov.a) || valid(ov.d) || /[øØ⌀]\s*\d/.test(m.name);
    const knownSpec = spec !== null;
    const a = shape.section.w; const b = shape.section.h;
    let t = m.wallMm ?? d[2] ?? (spec?.kind === 'tube' ? spec.c : undefined);
    const round = /[øØ⌀]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×]\s*(\d+(?:[.,]\d+)?))?/i.exec(m.name);
    if (round && !m.drawn) {
      const diameter = ov.d ?? Number(round[1].replace(',', '.'));
      if (/\bpun[ai]?\b/.test(n)) return finish(Math.PI * diameter * diameter / 4, 'kg/m', `Puna okrugla šipka Ø${show(diameter)} mm`);
      const wall = m.wallMm ?? (round[2] ? Number(round[2].replace(',', '.')) : undefined);
      t = valid(wall) && 2 * wall < diameter ? wall : Math.min(diameter / 4, Math.max(1, Math.min(2, diameter / 12)));
      if (!valid(wall) || 2 * wall >= diameter || /kanal|zleb|[–-]\s*\d/.test(n)) { estimated = true; notes.push(`Okrugla cev, usvojen zid ${show(t)} mm; dodatni kanali nisu uračunati`); }
      return finish(Math.PI * (diameter * t - t * t), 'kg/m', `Ø${show(diameter)}×${show(t)} mm`);
    }
    if (!m.drawn && (spec?.kind === 'u' || spec?.kind === 'l')) {
      return finish(spec.c * (spec.a + (spec.kind === 'u' ? 2 : 1) * spec.b - (spec.kind === 'u' ? 2 : 1) * spec.c), 'kg/m', `${spec.kind.toUpperCase()} presek ${show(spec.a)}×${show(spec.b)}×${show(spec.c)} mm`);
    }
    if (!m.drawn && spec?.kind === 'h') return finish(spec.t * (spec.width + 2 * (spec.up + spec.down)), 'kg/m', `H presek, širina ${show(spec.width)}, kraci ${show(spec.up)}+${show(spec.down)}, zid ${show(spec.t)} mm`);
    if (m.drawn || spec?.kind === 'shape' || spec?.kind === 'slant' || spec?.kind === 'c' || ['z', 'c', 'kose', 'maske'].includes(shape.group)) {
      estimated = true;
      if (/rukohvat profilisan/.test(n) && m.drawn?.polys?.every((p) => p.holes.length === 0)) {
        t = m.wallMm ?? m.drawn.wall ?? 2;
        return finish(shell(a, b, t), 'kg/m', `Šematski rukohvat bez nacrtane šupljine: usvojen šuplji presek ${show(a)}×${show(b)}, zid ${show(t)} mm`);
      }
      const section = shape.section.polys.reduce((sum, p) => sum + Math.max(0, area(p.outline) - p.holes.reduce((s, h) => s + area(h), 0)), 0);
      if (valid(section)) return finish(section, 'kg/m', `Površina nacrtanog/šematskog preseka ${show(section)} mm², oduzete šupljine; sitni detalji i preklapanja su približni`);
    }
    if (/traka|flah|\bpun[ai]?\b/.test(n) && !/mask|lajsn/.test(n)) {
      if (!hasSize || /lamel/.test(n)) { estimated = true; notes.push('Usvojen pun pravougaoni presek trake; tip/dimenzije nisu potvrđeni'); }
      return finish(a * b, 'kg/m', `Puna traka ${show(a)}×${show(b)} mm`);
    }
    if (!valid(t) || 2 * t >= Math.min(a, b)) {
      t = Math.min(Math.max(a, b) >= 80 ? 2 : 1.5, Math.min(a, b) / 4);
      estimated = true; notes.push(`Usvojen zid ${show(t)} mm`);
    }
    if (!hasSize && !knownSpec) { estimated = true; notes.push(`Usvojene spoljne mere ${show(a)}×${show(b)} mm iz podrazumevanog crteža`); }
    if (/\bu[- ]?profil|^u \d/.test(n)) return finish(t * (a + 2 * b - 2 * t), 'kg/m', `U presek ${show(a)}×${show(b)}×${show(t)} mm`);
    if (/\bl[- ]?profil|ugaoni profil/.test(n)) return finish(t * (a + b - t), 'kg/m', `L presek ${show(a)}×${show(b)}×${show(t)} mm`);
    if (shape.group === 'h') {
      estimated = true;
      const width = ov.width ?? d[0] ?? 60; const up = ov.up ?? 20; const down = ov.down ?? 10;
      notes.push(`Usvojeni kraci ${show(up)}+${show(down)} mm`);
      return finish(t * (width + 2 * (up + down)), 'kg/m', 'Približan H presek');
    }
    if (/maskic|lajsn/.test(n)) { estimated = true; return finish(t * (a + 2 * b - 2 * t), 'kg/m', `Približna maskica/U presek ${show(a)}×${show(b)}×${show(t)} mm`); }
    let section = shell(a, b, t);
    if (/zleb|kanal/.test(n) || (/lamel|komor|profil|dask|letvic|rukohvat/.test(n) && !/cev/.test(n))) estimated = true;
    if (/komor|panel-profil/.test(n)) {
      const ribs = Math.max(1, Math.floor(a / 80)); section += ribs * Math.max(0, b - 2 * t) * t;
      estimated = true; notes.push(`Usvojeno ${ribs} unutrašnjih rebara debljine zida`);
    }
    return finish(section, 'kg/m', `Šuplji pravougaoni presek ${show(a)}×${show(b)}×${show(t)} mm`);
  }
  estimated = true;
  notes.push('Oblik i mere nisu potvrđeni; usvojen pun komad 40×40×20 mm');
  return finish(40 * 40, 'kg/kom', 'Približna zapremina komada', 20);
}
