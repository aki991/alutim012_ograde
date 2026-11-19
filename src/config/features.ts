import { isTerraceMaterial } from '../domain/models/materialShape';

/**
 * Prekidači funkcija. Funkcija koja je isključena je samo SAKRIVENA: kod, podaci (projekti, nacrtani modeli, materijali) i testovi ostaju,
 * pa se ponovo uključuje promenom jedne vrednosti ovde.
 *
 * terraceFences: ograde za terase — stranica „Modeli ograda za terase“ i njeno crtanje, izbor modela terasa u projektu (katalog,
 * svojstva, dodavanje elementa), materijali za terase u listama i tekst u pomoći. Projekti koji već koriste ogradu za terasu rade kao pre.
 * Za vraćanje: promeniti u `true`.
 */
export const FEATURES = {
  terraceFences: true,
} as const;

/**
 * Materijali koje korisnik vidi u listama i izborima: uz isključene ograde za terase materijali za terase se ne prikazuju
 * (osim onih čiji je ID u `keep`, npr. izabran materijal dela, da prikaz postojećeg ne ostane prazan).
 */
export function visibleMaterials<T extends { id?: string; terrace?: boolean }>(materials: T[], keep: readonly string[] = []): T[] {
  if (FEATURES.terraceFences) return materials;
  return materials.filter((m) => !isTerraceMaterial(m) || (m.id !== undefined && keep.includes(m.id)));
}
