import { writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_CARRIAGES, DEFAULT_PLATES, DEFAULT_RAILS, missingModelMaterials } from '../../data/modelMaterials';
import { SEED_MATERIALS } from '../../data/materials';
import { newCustomModel, type CustomModel } from '../../domain/models/custom';
import { FENCE_MODEL_LIST } from '../../domain/models/catalog';
import { registerCustomModels } from '../../domain/models/customRegistry';
import { modelWithFrame } from '../../domain/models/frame';
import type { FenceModelId } from '../../domain/models/types';
import { DEFAULT_KERF_MM, DEFAULT_STOCK_MM } from '../../domain/pricing/cutting';
import { auditAll, auditModel } from './fenceAudit';

const base = SEED_MATERIALS.map((m) => ({ ...m }));
const MATS = [...base, ...missingModelMaterials(base), ...DEFAULT_CARRIAGES, ...DEFAULT_RAILS, ...DEFAULT_PLATES];
const OPTS = { stockMm: DEFAULT_STOCK_MM, kerfMm: DEFAULT_KERF_MM };
/** sve definicije dvorišnih ograda iz kataloga (i obrisani originali: od njih su nastali dorađeni crteži) */
const YARD_ALL = FENCE_MODEL_LIST.filter((m) => !m.terrace);

/** provere koje su ispravljene: krojna lista, radni nalog i mera skice moraju da se slažu za svaki model i svaku kapiju */
const FIXED = /^(krojna lista: broj komada|krojna lista: zbir šipke|krojna lista: zbirni spisak|krojna lista ↔ spisak rezova|radni nalog|skica: mera|sastavnica|dokumenti|pravljenje projekta)/;

afterEach(() => registerCustomModels([], []));

describe('provera dokumenata za proizvodnju: tri platna, pešačka, jednokrilna, dvokrilna, klizna i samostojeća klizna kapija', () => {
  it('modeli iz kataloga (i obrisani originali, kao polazni crteži dorada): krojna lista, radni nalog i mera skice se slažu', () => {
    const models = YARD_ALL.map((m) => m.id);
    const findings = auditAll(models, MATS, undefined, OPTS);
    if (process.env.AUDIT_OUT) writeFileSync(process.env.AUDIT_OUT, JSON.stringify({ models, findings }, null, 1));
    expect(findings.filter((f) => f.severity === 'greška' && FIXED.test(f.check)).map((f) => `${f.model} · ${f.element} · ${f.check}: ${f.detail}`)).toEqual([]);
    // dvokrilna kapija: svako krilo ima svoj ram i ispunu (ranije su vodoravni delovi išli preko cele kapije)
    expect(findings.filter((f) => f.element === 'Dvokrilna kapija' && /samo u krojnoj listi: \d+× [^,|]+ 3\d{3} mm/.test(f.detail))).toEqual([]);
  });

  it('nacrtan model sa ramom (rez 45°): krojna lista = skica na svakoj meri polja i krila', () => {
    // platno 440 × 600: bočni U profili cele visine i vodoravne cevi između njih, pa ram od cevi oko svega (kao „Dodaj ram“)
    const u = MATS.find((m) => m.id === 'mat_u_20x20')!; const kv = MATS.find((m) => m.id === 'mat_kv_30x20')!;
    const tube = MATS.find((m) => /Kvadratna cev 30×20/.test(m.name)) ?? kv;
    const inner: CustomModel = {
      ...newCustomModel('cm_ram'), name: 'Ram 45°', widthMm: 400, heightMm: 600,
      parts: [
        { id: 'g1', materialId: u.id, x: 10, y: 0, lengthMm: 600, angleDeg: 90, rot: 0, z: 0 },
        { id: 'g2', materialId: u.id, x: 390, y: 0, lengthMm: 600, angleDeg: 90, rot: 0, z: 0 },
        ...[100, 250, 400, 550].map((y, i) => ({ id: `t${i}`, materialId: kv.id, x: 20, y, lengthMm: 360, angleDeg: 0, rot: 0, z: 0 })),
      ],
    };
    const framed = modelWithFrame(inner, tube, MATS, 0);
    if ('error' in framed) throw new Error(framed.error);
    registerCustomModels([framed], MATS);
    const findings = auditModel(framed.id as FenceModelId, MATS, undefined, OPTS);
    expect(findings.filter((f) => f.severity === 'greška').map((f) => `${f.element} · ${f.check}: ${f.detail}`)).toEqual([]);
  });
});
