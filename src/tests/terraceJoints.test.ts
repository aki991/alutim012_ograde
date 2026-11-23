import { afterEach, describe, expect, it } from 'vitest';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { withTerraceMaterials } from '../data/terraceMaterials';
import { newTerraceModel, type CustomModel, type CustomPart } from '../domain/models/custom';
import { customPartsFor, registerCustomModels } from '../domain/models/customRegistry';
import { createFence, createProject } from '../domain/models/factories';
import { computeLayout } from '../domain/geometry/layout';
import { computePlan } from '../domain/geometry/plan';
import { withRunPosts } from '../domain/geometry/runPosts';
import { ballJointGeometry, jointControls, vAdd, vDot, vSub, vUnit, type V3 } from '../domain/geometry/pipeJoints';
import { buildCutList } from '../domain/pricing/production';
import { buildBom } from '../domain/pricing/calc';

const mats = withTerraceMaterials(MODEL_MATERIALS)!;
const bySku = (sku: string) => mats.find((m) => m.sku === sku)!;
const part = (id: string, sku: string, x: number, y: number, lengthMm: number, angleDeg: number): CustomPart => ({ id, materialId: bySku(sku).id, x, y, lengthMm, angleDeg, rot: 0, z: 0 });
const model = (square = false): CustomModel => ({ ...newTerraceModel('Spojevi'), id: 'cm_joint_geometry', widthMm: 1200, heightMm: 1100,
  parts: [part('p1', square ? 'P-1057' : 'P-1054', 100, 0, 1000, 90), part('p2', square ? 'P-1057' : 'P-1054', 1100, 0, 1000, 90),
    part('h', square ? 'P-1072' : 'P-1037', 0, 1040, 1200, 0),
    ...(!square ? [part('r1', 'P-1146', 0, 300, 1200, 0), part('r2', 'P-1146', 0, 600, 1200, 0)] : [])],
});
const build = (mode: 'ball' | 'elbow', turn: number, riseA: number, riseB: number, square = false) => {
  const m = model(square); registerCustomModels([m], mats, []);
  const project = createProject('Ugaoni spoj', [riseA, riseB].map((rise, i) => createFence({ modelId: m.id as 'cm_joint_geometry', widthMm: i ? 1700 : 1500, heightMm: 1100,
    ...(rise ? { stair: { riseMm: rise, steps: 6, group: `s${i}` } } : {}) })));
  project.posts[1] = { ...project.posts[1], turnDeg: turn };
  project.settings = { ...project.settings, cornerJoint: mode, cornerArmMm: 40 };
  return withRunPosts(project, mats);
};
afterEach(() => registerCustomModels([], mats, []));

describe('iste tačke spoja u prostoru i u krojnoj listi', () => {
  for (const mode of ['ball', 'elbow'] as const) for (const [turn, riseA, riseB] of [[90, 0, 0], [-90, 0, 0], [45, 0, 0], [0, 0, -1020], [0, 900, 0], [90, 0, -1020], [-90, 900, 0]]) {
    it(`${mode}, skretanje ${turn}°, visine ${riseA}/${riseB}: spoj dodiruje obe cevi bez deformacije i računa se jednom`, () => {
      const p = build(mode, turn, riseA, riseB);
      const layout = computeLayout(p); const plan = computePlan(p);
      expect(layout.totalModularMm).toBe(3200);
      expect(withRunPosts(p, mats)).toBe(p);
      const sets = p.items.map((it, i) => {
        if (it.kind !== 'fence') throw new Error('Očekivana ograda');
        return customPartsFor(it.modelId, layout.items[i].clearWidth, it.heightMm, '#999', it.params.slats).map((r) => r.part);
      });
      const world = (i: number, part: CustomPart, x = part.x): V3 => {
        const l = layout.items[i]; const pi = plan.items[i]; const tan = (l.floorEnd - l.floorStart) / (l.axisEnd - l.axisStart);
        const along = l.clearStart - l.axisStart + x;
        return [pi.start.x + along * Math.cos(pi.heading) - part.z * Math.sin(pi.heading), l.floorStart + part.y + tan * along, pi.start.z + along * Math.sin(pi.heading) + part.z * Math.cos(pi.heading)];
      };
      const rotate = (i: number, v: V3): V3 => { const h = plan.items[i].heading; return [v[0] * Math.cos(h) - v[2] * Math.sin(h), v[1], v[0] * Math.sin(h) + v[2] * Math.cos(h)]; };
      const joints = sets[0].filter((part) => part.joint3d);
      expect(joints).toHaveLength(3);
      expect(sets[1].some((part) => part.joint3d || part.hw?.kind === 'cornerArm')).toBe(false);
      for (const fitting of joints) {
        const j = fitting.joint3d!;
        const incoming = sets[0].find((part) => part.id === fitting.hw!.on)!;
        const outgoing = sets[1].find((part) => part.id === fitting.hw!.on)!;
        const at = world(0, fitting);
        expect(Math.hypot(...vSub(world(0, incoming, incoming.x + incoming.lengthMm), at))).toBeLessThan(1e-6);
        expect(Math.hypot(...vSub(world(1, outgoing), vAdd(at, rotate(0, j.end))))).toBeLessThan(1e-6);
        const controls = jointControls(j);
        expect(vDot(vUnit(vSub(controls[1], controls[0])), j.incoming)).toBeCloseTo(1, 8);
        expect(vDot(vUnit(vSub(controls[3], controls[2])), j.outgoing)).toBeCloseTo(1, 8);
        if (mode === 'ball') {
          const { center, necks } = ballJointGeometry(j);
          expect(necks[0][0]).toEqual([0, 0, 0]);
          expect(necks[0][3]).toEqual(center);
          expect(necks[1][0]).toEqual(center);
          expect(necks[1][3]).toEqual(j.end);
          expect(vDot(vUnit(vSub(necks[0][1], necks[0][0])), j.incoming)).toBeCloseTo(1, 8);
          expect(vDot(vUnit(vSub(necks[1][3], necks[1][2])), j.outgoing)).toBeCloseTo(1, 8);
          expect(Math.hypot(...vSub(center, j.centerA))).toBeCloseTo(Math.hypot(...vSub(center, j.centerB)), 8);
        }
        expect(j.takeoffMm).toBe(mode === 'elbow' ? 40 : fitting.hw!.on === 'h' ? 36 : 18.4);
      }
      for (const [i, parts] of sets.entries()) {
        const tan = (layout.items[i].floorEnd - layout.items[i].floorStart) / (layout.items[i].axisEnd - layout.items[i].axisStart);
        for (const pipe of parts.filter((part) => part.id === 'h' || part.id.startsWith('r'))) {
          if (tan) {
            expect(pipe.tube3d?.lengthMm).toBeCloseTo(pipe.lengthMm * Math.hypot(1, tan), 8);
            expect(pipe.tube3d?.angleDeg).toBeCloseTo(Math.atan(tan) * 180 / Math.PI, 8);
            expect(pipe.unshearTan).toBe(tan);
          }
        }
      }
      const expected = sets.flatMap((parts, i) => parts.filter((part) => part.materialId === bySku('P-1146').id && !part.hw).map((part) => Math.round(part.tube3d?.lengthMm ?? part.lengthMm * Math.hypot(1, (layout.items[i].floorEnd - layout.items[i].floorStart) / (layout.items[i].axisEnd - layout.items[i].axisStart))))).sort();
      const cuts = buildCutList(p, undefined, mats).filter((r) => r.profile === bySku('P-1146').name).flatMap((r) => Array.from({ length: r.qty }, () => r.lengthMm)).sort();
      expect(cuts).toEqual(expected);
      for (const row of buildCutList(p, undefined, mats).filter((r) => r.profile === bySku('P-1146').name)) {
        expect(row.ends).toEqual([[90], [90]]);
        expect(row.note).not.toMatch(/krajevi pod uglom/);
      }
    });
  }

  it('pravougaoni rukohvat staklene ograde dobija pravougaoni ugaoni spoj', () => {
    const p = build('elbow', 90, 0, 0, true);
    const it = p.items[0]; if (it.kind !== 'fence') throw new Error('Očekivana ograda');
    const fittings = customPartsFor(it.modelId, it.widthMm, it.heightMm, '#999', it.params.slats).filter((r) => r.part.joint3d);
    expect(fittings).toHaveLength(1);
    expect(fittings[0].part.joint3d).toMatchObject({ mode: 'elbow', round: false, faceMm: 60, depthMm: 25, angleDeg: 90, takeoffMm: 40 });
  });

  it('ravno–stepenište–ravno: prečke su spojene na oba kraja, a flanše i veze ostaju ravne', () => {
    const base = model();
    const m = { ...base, parts: base.parts.map((p) => p.id.startsWith('p') ? { ...p, hwPick: { flange: bySku('AK-5036').id, connector: bySku('AK-5039-40').id } }
      : p.id.startsWith('r') ? { ...p, hwPick: { holder: bySku('AK-5011Y').id } } : p) };
    registerCustomModels([m], mats, []);
    const p0 = createProject('Prelazi', [4000, 1700, 4000].map((widthMm, i) => createFence({ modelId: m.id as 'cm_joint_geometry', widthMm, heightMm: 1100,
      params: { barSizeMm: 0, gapMm: 0, frameMm: 0, slats: { rodCount: 4 } }, ...(i === 1 ? { stair: { riseMm: -1020, steps: 6, group: 's' } } : {}) })));
    const p = withRunPosts(p0, mats); const layout = computeLayout(p);
    const sets = p.items.map((it, i) => {
      if (it.kind !== 'fence') throw new Error('Očekivana ograda');
      return customPartsFor(it.modelId, layout.items[i].clearWidth, it.heightMm, '#999', it.params.slats).map((r) => r.part);
    });
    expect(sets[0].filter((part) => part.joint3d)).toHaveLength(5);
    expect(sets[1].filter((part) => part.joint3d)).toHaveLength(5);
    for (const hardware of sets[1].filter((part) => ['flange', 'connector'].includes(part.hw?.kind ?? '') && !part.id.endsWith('~plate'))) {
      expect(hardware.unshearTan, hardware.id).toBeCloseTo(-1020 / 1700, 8);
    }
  });

  it('koleno fiksnog ugla ne zamenjuje drugi ugao u trebovanju', () => {
    const p = build('elbow', 0, 0, -1020);
    const item = p.items[0]; if (item.kind !== 'fence') throw new Error('Očekivana ograda');
    const joint = item.params.slats?.cornerConnections?.find((c) => c.on === 'r1')?.fitting;
    expect(joint?.shape.requiresMaterial).toBe(true);
    expect(joint?.materialId).toMatch(/^missing_joint/);
    const missing = buildBom(p, mats).find((r) => r.materialId === joint?.materialId)!;
    expect(missing.name).toContain('Koleno prečke');
    expect(missing.name).not.toContain('missing_joint');
    expect(missing).toMatchObject({ unit: 'kom', geometricQty: 2, missingPrice: true });
  });
});
