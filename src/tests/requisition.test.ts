import { describe, expect, it } from 'vitest';
import { createFence, createGate, createProject } from '../domain/models/factories';
import { buildRequisition, resetRequisition, setRequisitionQty } from '../domain/pricing/requisition';
import { buildCuttingList, DEFAULT_KERF_MM, DEFAULT_STOCK_MM } from '../domain/pricing/cutting';
import { buildBom } from '../domain/pricing/calc';
import { SEED_MATERIALS } from './fixtures/materials';

const opts = { stockMm: DEFAULT_STOCK_MM, kerfMm: DEFAULT_KERF_MM };
const project = () => createProject('Trebovanje', [createFence({ widthMm: 2000, modelId: 'picket_narrow' }), createFence({ widthMm: 2000, modelId: 'picket_narrow' }), createGate('pedestrian', { infillModelId: 'picket_narrow' })]);

describe('trebovanje materijala', () => {
  it('profili u celim šipkama iz krojne liste, ostali materijal iz sastavnice', () => {
    const p = project();
    const req = buildRequisition(p, SEED_MATERIALS, undefined, opts);
    const lines = req.groups.flatMap((g) => g.lines);
    expect(lines.length).toBeGreaterThan(0);
    const cut = buildCuttingList(p, undefined, SEED_MATERIALS, opts);
    // svaki profil iz krojne liste je u trebovanju sa istim brojem novih šipki
    for (const plan of cut.profiles) {
      const l = lines.find((x) => x.name === plan.profile);
      expect(l, plan.profile).toBeDefined();
      expect(l!.unit).toBe('šipka');
      expect(l!.calc).toBe(plan.newBars + plan.oversize.length);
    }
    // komadni materijal iz sastavnice (npr. kape, vijci) je u celim komadima
    const bom = buildBom(p, SEED_MATERIALS).filter((b) => b.key !== 'extra' && b.unit === 'kom');
    for (const b of bom) expect(lines.find((x) => x.name === b.name)?.calc).toBe(Math.ceil(b.purchaseQty - 1e-6));
    expect(lines.every((l) => Number.isInteger(l.calc) || l.unit === 'm2')).toBe(true);
  });

  it('ručno izmenjena količina se čuva uz projekat i vraća na izračunatu', () => {
    const p = project();
    const first = buildRequisition(p, SEED_MATERIALS, undefined, opts).groups.flatMap((g) => g.lines).find((l) => l.unit === 'šipka')!;
    const edited = setRequisitionQty(p, first.key, first.calc + 1);
    const l2 = buildRequisition(edited, SEED_MATERIALS, undefined, opts).groups.flatMap((g) => g.lines).find((l) => l.key === first.key)!;
    expect(l2.qty).toBe(first.calc + 1);
    expect(l2.edited).toBe(true);
    expect(l2.calc).toBe(first.calc);
    const back = resetRequisition(edited);
    expect(back.requisition).toBeUndefined();
    const l3 = buildRequisition(back, SEED_MATERIALS, undefined, opts).groups.flatMap((g) => g.lines).find((l) => l.key === first.key)!;
    expect(l3.qty).toBe(first.calc);
    expect(setRequisitionQty(edited, first.key, null).requisition).toBeUndefined();
  });
});
