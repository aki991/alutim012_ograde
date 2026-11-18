import { expect, it } from 'vitest';
import { materialOwnColor } from '../domain/models/materialShape';
it('okov je siv', () => {
  for (const n of ['Sigurnosna brava sa cilindrom', 'Brava standardna sa kvakom', 'Elektro-brava', 'Šarka pojačana', 'Prihvatnik brave', 'Vertikalni podni zasun (rigla)', 'Podni prihvat zasuna sa graničnikom']) expect(materialOwnColor(n)).toBe('#8D97A3');
  expect(materialOwnColor('Kvadratna cev 80×20×1')).toBeNull();
});
