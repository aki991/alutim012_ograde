import { afterEach, describe, expect, it } from 'vitest';
import { computeLayout } from '../domain/geometry/layout';
import { changeModelAll } from '../domain/geometry/operations';
import { FENCE_MODELS } from '../domain/models/catalog';
import { newCustomModel, scaleModel, type CustomModel } from '../domain/models/custom';
import { allFenceModels, customPartsFor, isCustomModel, registerCustomModels } from '../domain/models/customRegistry';
import { createFence, createGate, createProject } from '../domain/models/factories';
import { defaultSpec } from '../domain/models/spec';
import type { FenceModelId, Material } from '../domain/models/types';
import { buildBom } from '../domain/pricing/calc';
import { buildCutList } from '../domain/pricing/production';

const mat = (id: string, sku: string, name: string, unit: Material['unit'], unitPrice: number): Material => ({ id, sku, name, unit, category: unit === 'm' ? 'profil' : 'okov', unitPrice, wastePercent: 0, demo: false });
const kv = mat('m_kv', 'KV000007', 'Kvadratna cev 80×20×1 mm', 'm', 300);
const rail = mat('m_rail', 'KV000021', 'Kvadratna cev 30×30×2 mm', 'm', 200);
const cap = mat('m_cap', 'K100018', 'Čep tarabice pun 80x20mm', 'kom', 50);
const MATS = [kv, rail, cap];

const part = (id: string, materialId: string, x: number, y: number, lengthMm: number, angleDeg: number) => ({ id, materialId, x, y, lengthMm, angleDeg, rot: 0, z: 0 });
/** polje 1000 × 1000: pet uspravnih letvica 900 mm sa čepom i dve vodoravne spojne cevi 1000 mm */
const MODEL: CustomModel = {
  ...newCustomModel('cm_test'), name: 'Moja tarabica', widthMm: 1000, heightMm: 1000,
  parts: [
    ...[100, 300, 500, 700, 900].flatMap((x, i) => [part(`s${i}`, kv.id, x, 50, 900, 90), part(`c${i}`, cap.id, x, 950, 0, 0)]),
    part('r1', rail.id, 0, 200, 1000, 0), part('r2', rail.id, 0, 800, 1000, 0),
  ],
};
const ID = MODEL.id as FenceModelId;

afterEach(() => registerCustomModels([], []));

describe('nacrtani model u projektu', () => {
  it('upisuje se u katalog i nudi u izboru modela; brisanjem nestaje', () => {
    registerCustomModels([MODEL], MATS);
    expect(isCustomModel(ID)).toBe(true);
    expect(FENCE_MODELS[ID]).toMatchObject({ name: 'Moja tarabica', style: 'custom', defaultSize: { widthMm: 1000, heightMm: 1000, clearWidth: true } });
    expect(allFenceModels().map((m) => m.id)).toContain(ID);
    registerCustomModels([], MATS);
    expect(ID in FENCE_MODELS).toBe(false);
    expect(allFenceModels()).toHaveLength(14);
  });

  it('razvlačenje: dužine prate polje, preseci i broj delova ostaju isti', () => {
    const big = scaleModel(MODEL, 2000, 1500);
    expect(big.parts).toHaveLength(MODEL.parts.length);
    expect(big.parts.find((p) => p.id === 's1')).toMatchObject({ x: 600, y: 75, lengthMm: 1350, angleDeg: 90 });
    expect(big.parts.find((p) => p.id === 'r1')).toMatchObject({ x: 0, y: 300, lengthMm: 2000, angleDeg: 0 });
    expect(scaleModel(MODEL, 1000, 1000)).toBe(MODEL);
    registerCustomModels([MODEL], MATS);
    const drawn = customPartsFor(ID, 2000, 1500, '#112233');
    expect(drawn).toHaveLength(12);
    expect(drawn[0].hex).toBe('#112233');
    expect(customPartsFor('cm_nema', 1000, 1000, '#000')).toEqual([]);
  });

  it('specifikacija, kalkulacija i krojna lista računaju delove sa crteža', () => {
    registerCustomModels([MODEL], MATS);
    const spec = defaultSpec(ID);
    expect(spec.map((s) => [s.materialId, s.qty, s.lengthMm])).toEqual([[kv.id, '5', '900*H/1000'], [cap.id, '5', undefined], [rail.id, '2', '1000*W/1000']]);

    let p = createProject('t', [createFence({ modelId: ID, heightMm: 1000 })]);
    const clear = computeLayout(p).items[0].clearWidth;
    const bom = buildBom(p, MATS);
    const qty = (id: string) => bom.find((l) => l.materialId === id)?.geometricQty ?? 0;
    expect(qty(kv.id)).toBeCloseTo(4.5, 6);
    expect(qty(cap.id)).toBe(5);
    expect(qty(rail.id)).toBeCloseTo((2 * clear) / 1000, 6);

    const cut = buildCutList(p, undefined, MATS);
    expect(cut.find((r) => r.profile === kv.name)).toMatchObject({ lengthMm: 900, qty: 5 });
    expect(cut.find((r) => r.profile === rail.name)).toMatchObject({ lengthMm: Math.round(clear), qty: 2 });

    // viša ograda: uspravne letvice su duže, broj isti
    p = { ...p, items: p.items.map((it) => (it.kind === 'fence' ? { ...it, heightMm: 1500 } : it)) };
    expect(buildBom(p, MATS).find((l) => l.materialId === kv.id)?.geometricQty).toBeCloseTo(6.75, 6);
  });

  it('model se primenjuje na ogradu i kapiju postojećeg projekta', () => {
    registerCustomModels([MODEL], MATS);
    const p = changeModelAll(createProject('t', [createFence({ modelId: 'h_wide' }), createGate('pedestrian', { infillModelId: 'h_wide' })]), ID);
    expect(p.items.map((it) => (it.kind === 'fence' ? it.modelId : it.kind === 'gate' ? it.infillModelId : null))).toEqual([ID, ID]);
    expect(buildBom(p, MATS).find((l) => l.materialId === cap.id)?.geometricQty).toBe(10);
  });
});
