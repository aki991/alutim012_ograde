import { describe, expect, it } from 'vitest';
import { newCustomModel } from '../domain/models/custom';
import { remapMissingMaterials } from '../domain/models/materialRemap';
import type { Material } from '../domain/models/types';

const mat = (id: string, sku: string, name: string): Material => ({ id, sku, name, category: 'okov', unit: 'kom', unitPrice: 50, wastePercent: 0, demo: false });
const part = (id: string, materialId: string) => ({ id, materialId, x: 0, y: 0, lengthMm: 0, angleDeg: 0, rot: 0, z: 0 });

describe('deo sa obrisanim materijalom prelazi na isti materijal iz cenovnika', () => {
  it('čep tarabice K100018: obrisan ugrađeni ID → uvezeni materijal iste šifre', () => {
    const mats = [mat('mat_imp_k100018', 'K100018', 'Čep tarabice pun 80×20'), mat('mat_imp_k100019', 'K100019', 'Čep tarabice šuplji 80×20')];
    const m = { ...newCustomModel('cm_t'), parts: [part('a', 'mat_ek_k100018'), part('b', 'mat_imp_k100019'), part('c', 'mat_ek_nepostoji')] };
    const out = remapMissingMaterials([m], mats)!;
    expect(out[0].parts.map((p) => p.materialId)).toEqual(['mat_imp_k100018', 'mat_imp_k100019', 'mat_ek_nepostoji']);
    // posle zamene nema više šta da se menja
    expect(remapMissingMaterials(out, mats)).toBeNull();
  });

  it('ne menja ako ista šifra postoji dva puta (ne zna se koji je pravi)', () => {
    const mats = [mat('x1', 'K100018', 'A'), mat('x2', 'K100018', 'B')];
    expect(remapMissingMaterials([{ ...newCustomModel('cm_t'), parts: [part('a', 'mat_ek_k100018')] }], mats)).toBeNull();
  });
});
