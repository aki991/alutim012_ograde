import { describe, expect, it } from 'vitest';
import { cleanMaterialName } from '../domain/models/materialTitle';
import { materialShape } from '../domain/models/materialShape';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { SEED_MATERIALS } from './fixtures/materials';

describe('čitljivi nazivi materijala', () => {
  it.each([
    ['Pravougaona cev 80×20×1 mm, sirovo (Ekoluka Key; osnovica cene nepotvrđena)', 'Pravougaona cev 80×20×1'],
    ['Kvadratna cev 60×40×3 mm, sirovo (Ekoluka Key)', 'Kvadratna cev 60×40×3'],
    ['Kvadratna cev 60×20×1 mm, RAL 7016 (Ekoluka Key)', 'Kvadratna cev 60×20×1'],
    ['Zakošena letvica 80×20×1 mm, boja 7016 (Ekoluka Key; osnovica cene nepotvrđena)', 'Zakošena letvica 80×20×1'],
    ['Okrugla cev Ø25×1,5 RAL 9005', 'Okrugla cev Ø25×1,5'],
    ['U 60×20×2 mm, sirovo (Ekoluka Key; nije isto što i U 60×28)', 'U profil 60×20×2'],
    ['U 60×28 (podatak radnika; nije u cenovniku — uneti cenu)', 'U profil 60×28'],
    ['Kvadratna cev 80×80×3 mm, sirovo — stub (Ekoluka Key; uneti cenu)', 'Kvadratna cev 80×80×3'],
    ['Kvadratna cev 30×20×1 mm — horizontalna letvica (podatak radnika; uneti cenu)', 'Kvadratna cev 30×20×1'],
    ['U profil 20×20×1,35 mm — bočna vođica (podatak radnika; uneti cenu)', 'U profil 20×20×1,35'],
    ['Kvadratna cev 40x40x2 mm, ram (test)', 'Kvadratna cev 40×40×2, ram'],
    ['Čep tarabice pun 80×20 mm (Ekoluka Key; uneti cenu)', 'Čep tarabice pun 80×20'],
    // ostaje: debljina stakla, boja u zagradi, mere posle crte
    ['Kaljeno staklo 8 mm (mat)', 'Kaljeno staklo 8 mm (mat)'],
    ['Okrugla prečka Ø25–30 (inox / aluminijum)', 'Okrugla prečka Ø25–30 (inox / aluminijum)'],
    ['Rukohvat — inox cev Ø50 × 2 mm (BTS RL10; uneti cenu)', 'Rukohvat — inox cev Ø50 × 2 mm (BTS RL10; uneti cenu)'.replace(' mm (BTS RL10; uneti cenu)', '')],
  ])('%s → %s', (a, b) => {
    expect(cleanMaterialName(a)).toBe(b);
  });

  it('oblik i mere materijala se ne menjaju čišćenjem naziva (isti presek, grupa i boja)', () => {
    for (const m of [...SEED_MATERIALS, ...MODEL_MATERIALS]) {
      const clean = { ...m, name: cleanMaterialName(m.name) };
      const a = materialShape(m); const b = materialShape(clean);
      expect(b.type, m.name).toBe(a.type);
      if (a.type === 'linear' && b.type === 'linear') {
        expect(b.group, m.name).toBe(a.group);
        expect(JSON.stringify(b.section.polys), m.name).toBe(JSON.stringify(a.section.polys));
      }
    }
  });

  it('naziv se ne praznuje i dvaput očišćen je isti', () => {
    for (const m of SEED_MATERIALS) {
      const once = cleanMaterialName(m.name);
      expect(once.length).toBeGreaterThan(0);
      expect(cleanMaterialName(once)).toBe(once);
    }
  });
});
