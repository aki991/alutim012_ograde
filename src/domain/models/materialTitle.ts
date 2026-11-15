/**
 * Čitljiv naziv materijala: vrsta pa dimenzije („Kvadratna cev 60×40×3“, „U profil 60×28“), bez beleški iz uvoza i cenovnika
 * („sirovo“, „Ekoluka Key“, „uneti cenu“, „podatak radnika“ …). Oznaka boje („RAL 7016“) se izbacuje: boja se bira ručno na modelu.
 */

/** beleške iz uvoza i cenovnika koje ne pripadaju nazivu */
const NOISE = /ekoluka|osnovica cene|uneti cenu|podatak radnika|nije u cenovniku|nije isto|\(test\)|^\s*test\s*$/i;

export function cleanMaterialName(raw: string): string {
  let s = raw.replace(/\s+/g, ' ').trim();
  // zagrade sa beleškom iz uvoza (ostale zagrade, npr. „(inox / aluminijum)“, ostaju)
  s = s.replace(/\s*\([^)]*\)/g, (m) => (NOISE.test(m) ? '' : m));
  // opis posle crte bez brojeva („— stub“, „— horizontalna letvica“); opis sa merama ostaje
  s = s.replace(/\s+[—–]\s+([^—–]*)$/, (m, tail: string) => (/\d/.test(tail) || /inox/i.test(tail) ? m : ''));
  // „x“ između mera je znak množenja
  s = s.replace(/(\d)\s*x\s*(?=\d)/gi, '$1×');
  // jedinica posle mera profila („80×20×1 mm“ → „80×20×1“); jedna mera (npr. debljina stakla) zadržava jedinicu
  s = s.replace(/(\d+(?:[,.]\d+)?(?:\s*×\s*\d+(?:[,.]\d+)?)+)\s*mm\b/gi, '$1');
  // „sirovo“ je podrazumevana obrada profila; boja se piše „RAL 7016“
  s = s.replace(/,\s*sirovo\b/gi, '').replace(/\bsirovo\b,?\s*/gi, '');
  s = s.replace(/,?\s*\bRAL\s*\d{3,4}\b/gi, '').replace(/,?\s*\bboja\s+\d{4}\b/gi, '');
  // „U 60×28“ je U profil
  s = s.replace(/^U\s+(?=\d)/, 'U profil ');
  s = s.replace(/\s+,/g, ',').replace(/,\s*$/, '').replace(/\s{2,}/g, ' ').trim();
  return s || raw.trim();
}
