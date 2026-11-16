import { describe, expect, it } from 'vitest';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { withTerraceMaterials } from '../data/terraceMaterials';
import { customBom, newTerraceModel, partBounds, type CustomModel, type CustomPart } from '../domain/models/custom';
import { hwDimsOf, materialShape, materialShapeWith, solidsBounds } from '../domain/models/materialShape';
import { buildSketch } from '../domain/models/sketch';
import { settleModel } from '../domain/models/settle';
import { compatibleHardware, fillHardware, removeParts, setHwPick, syncHardware } from '../domain/models/terraceHardware';

const mats = withTerraceMaterials(MODEL_MATERIALS)!;
const bySku = (sku: string) => mats.find((m) => m.sku === sku)!;
const part = (id: string, sku: string, x: number, y: number, len: number, angle: number, extra: Partial<CustomPart> = {}): CustomPart =>
  ({ id, materialId: bySku(sku).id, x, y, lengthMm: len, angleDeg: angle, rot: 0, z: 0, ...extra });

/** dva stuba Ø40 (1000 mm), tri prečke Ø16 i rukohvat Ø40 */
function fence(): CustomModel {
  return {
    ...newTerraceModel('t1'),
    parts: [
      part('p1', 'P-1054', 0, 0, 1000, 90), part('p2', 'P-1054', 1000, 0, 1000, 90),
      part('r1', 'P-1146', -50, 200, 1100, 0), part('r2', 'P-1146', -50, 500, 1100, 0), part('r3', 'P-1146', -50, 800, 1100, 0),
      part('h', 'P-1037', -50, 1040, 1100, 0),
    ],
  };
}

describe('okov ograde za terasu', () => {
  it('prečke se same postavljaju ispred stubova, bez ikakvog okova', () => {
    const m = settleModel(fence(), mats, false).model;
    // stub Ø40: prednja ivica z = 20; prsten Ø16 ima poluprečnik 15
    expect(m.parts.filter((p) => p.id.startsWith('r')).map((p) => p.z)).toEqual([35, 35, 35]);
    expect(m.parts.find((p) => p.id === 'p1')!.z).toBe(0);
    expect(m.parts.some((p) => p.hw)).toBe(false);
  });

  it('kvačice prave okov na pravom mestu: prstenovi, kapice, flanše i veze', () => {
    let m = fence();
    for (const r of ['r1', 'r2', 'r3']) { m = setHwPick(m, r, 'holder', bySku('AK-5011').id); m = setHwPick(m, r, 'rodCap', bySku('AK-5012A').id); }
    for (const p of ['p1', 'p2']) { m = setHwPick(m, p, 'flange', bySku('AK-5036').id); m = setHwPick(m, p, 'connector', bySku('AK-5039-40').id); }
    m = setHwPick(m, 'h', 'railCap', bySku('AK-5013').id);
    const s = settleModel(m, mats, false).model;
    const hw = (k: string) => s.parts.filter((p) => p.hw?.kind === k);
    expect(hw('holder')).toHaveLength(6);
    expect(hw('holder').every((p) => p.z === 35)).toBe(true);
    expect(hw('rodCap')).toHaveLength(6);
    expect(hw('flange')).toHaveLength(2);
    expect(hw('connector')).toHaveLength(2);
    expect(hw('railCap')).toHaveLength(2);
    // prsten je na osi prečke i na osi stuba
    const rod1 = s.parts.find((p) => p.id === 'r1')!;
    const h1 = hw('holder').find((p) => p.hw!.on === 'r1' && p.hw!.at === 'p1')!;
    expect(h1.x).toBe(0); expect(h1.y).toBe(rod1.y); expect(h1.z).toBe(rod1.z);
    // rukohvat naleže na vezu: vrh stuba + visina veze + poluprečnik rukohvata
    const post = s.parts.find((p) => p.id === 'p1')!;
    const top = post.y + 1000;
    expect(s.parts.find((p) => p.id === 'h')!.y).toBe(top + 30 + 20);
    // flanša je ispod stuba, a stub je podignut za njenu ploču
    const fl = hw('flange')[0];
    expect(post.y - fl.y).toBe(8);
    const mat = new Map(mats.map((x) => [x.id, x]));
    expect(partBounds(fl, materialShape(mat.get(fl.materialId)!)).y0).toBeLessThan(post.y);
  });

  it('ponovno uravnavanje ne menja model, a brisanje okova briše izbor', () => {
    let m = fence();
    m = setHwPick(m, 'r1', 'holder', bySku('AK-5011').id);
    const s = settleModel(m, mats, false).model;
    expect(syncHardware(s, mats)).toBe(s);
    expect(settleModel(s, mats, false).model).toEqual(s);
    const holder = s.parts.find((p) => p.hw)!;
    const after = settleModel(removeParts(s, new Set([holder.id])), mats, false).model;
    expect(after.parts.some((p) => p.hw)).toBe(false);
    expect(after.parts.find((p) => p.id === 'r1')!.hwPick).toBeUndefined();
  });

  it('Dopuni okov: svaki deo dobija odgovarajući okov; spisak materijala ima zavrtnje', () => {
    const filled = fillHardware(fence(), mats);
    expect(filled.parts.find((p) => p.id === 'p1')!.hwPick).toMatchObject({ flange: bySku('AK-5036X').id, postCap: bySku('AK-5062').id, connector: bySku('AK-5039-40').id });
    expect(filled.parts.find((p) => p.id === 'r2')!.hwPick).toMatchObject({ holder: bySku('AK-5011').id, rodCap: bySku('AK-5012A').id });
    expect(filled.parts.find((p) => p.id === 'h')!.hwPick).toEqual({ railCap: bySku('AK-5013').id });
    expect(fillHardware(filled, mats)).toBe(filled);
    const s = settleModel(filled, mats, false).model;
    const bom = customBom(s, mats);
    const qty = (sku: string) => bom.find((l) => l.sku === sku)?.count ?? 0;
    expect(qty('AK-5011')).toBe(6);
    expect(qty('BTS-VP4238')).toBe(6); // 1 po prstenu
    expect(qty('BTS-VP4219')).toBe(6); // 3 po vezi, 2 veze
    expect(qty('BTS-VT75100')).toBe(6); // 3 po flanši, 2 flanše
  });

  it('nudi samo okov koji odgovara prečniku', () => {
    const m = fence();
    const post = m.parts[0]; const rod = m.parts[2]; const rail = m.parts[5];
    expect(compatibleHardware('connector', post, m, mats).map((x) => x.sku)).toEqual(['AK-5039-40']); // rukohvat Ø40
    expect(compatibleHardware('railCap', rail, m, mats).map((x) => x.sku)).toContain('AK-5013');
    expect(compatibleHardware('railCap', rail, m, mats).map((x) => x.sku)).not.toContain('AK-5009'); // to je za Ø50
    expect(compatibleHardware('holder', rod, m, mats).map((x) => x.sku)).toEqual(expect.arrayContaining(['AK-5011', 'AK-5011Y']));
    expect(compatibleHardware('rodCap', rod, m, mats).map((x) => x.sku)).toEqual(['AK-5012A']);
  });

  it('dvorišni model ostaje nepromenjen i nema okov', () => {
    const yard: CustomModel = { ...fence(), kind: 'fence' };
    expect(syncHardware(yard, mats)).toBe(yard);
  });
});

describe('Mere ograde i skica', () => {
  it('mere okova modela menjaju položaje: veza, flanša, kapa, rastojanje prečke i zavrtnji', () => {
    let m: CustomModel = { ...fence(), hw: { connectorH: 40, plateH: 10, capH: 20, rodOffset: 22, screwsHolder: 2 } };
    for (const p of ['p1', 'p2']) { m = setHwPick(m, p, 'flange', bySku('AK-5036').id); m = setHwPick(m, p, 'postCap', bySku('AK-5062').id); m = setHwPick(m, p, 'connector', bySku('AK-5039-40').id); }
    m = setHwPick(m, 'r1', 'holder', bySku('AK-5011').id);
    const s = settleModel(m, mats, false).model;
    const post = s.parts.find((p) => p.id === 'p1')!;
    expect(post.y - s.parts.find((p) => p.hw?.kind === 'flange')!.y).toBe(10);
    expect(s.parts.find((p) => p.id === 'r1')!.z).toBe(20 + 22); // prednja ivica stuba + zadato rastojanje
    expect(s.parts.find((p) => p.id === 'h')!.y).toBe(post.y + 1000 + 20 + 40 + 20); // kapa + veza + poluprečnik rukohvata
    expect(s.parts.find((p) => p.hw?.kind === 'connector')!.y).toBe(post.y + 1000 + 20);
    const qty = (sku: string) => customBom(s, mats).find((l) => l.sku === sku)?.count ?? 0;
    expect(qty('BTS-VP4238')).toBe(4); // 2 zavrtnja × 2 prstena (jedna prečka, dva stuba)
  });

  it('vrata veze i ploča: oblik veze prati mere', () => {
    const con = bySku('AK-5039-40');
    const a = materialShapeWith(con, hwDimsOf({ connectorH: 30 })); const b = materialShapeWith(con, hwDimsOf({ connectorH: 50 }));
    const top = (sh: ReturnType<typeof materialShapeWith>) => (sh.type === 'piece' ? solidsBounds(sh.solids).y1 : 0);
    expect(top(a)).toBe(30); expect(top(b)).toBe(50); // gornja ivica ploče = donja ivica rukohvata
    expect(a.type === 'piece' && a.solids.length).toBe(3); // rame, vrat, ploča
  });

  it('skica ograde za terasu daje visine osa prečki od poda', () => {
    const s = settleModel(fence(), mats, true).model;
    const sk = buildSketch(s, mats);
    expect(sk.weldKind).toBe('rodCenter');
    expect(sk.welds.map((w) => w.value)).toEqual([800, 500, 200]);
    const yard = buildSketch({ ...s, kind: 'fence' }, mats);
    expect(yard.weldKind).toBe('weld');
    expect(yard.welds).toHaveLength(0);
  });
});
