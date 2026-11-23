import { customLiftOf, customModelOf, scaledModel } from '../models/customRegistry';
import { cornerMaterial, hwRoleOf, sizeTags } from '../models/terraceHardware';
import { hwDimsOf, materialShape, norm, sectionFace } from '../models/materialShape';
import type { CustomPart } from '../models/custom';
import type { FenceSection, Material, Project } from '../models/types';
import { computeLayout } from './layout';
import { computePlan } from './plan';
import { ballTakeoff, jointAngle, vAdd, vScale, vSub, vUnit, type PipeConnection, type V3 } from './pipeJoints';

/** Jedan obračun oba kraja spoja: svako polje dobija svoj kraj cevi, a samo dolazeće polje crta i računa spojnicu. */
export function withCornerConnections(project: Project, materials: Material[]): Project {
  const layout = computeLayout(project); const plan = computePlan(project);
  const byId = new Map(materials.map((m) => [m.id, m]));
  const wants = new Map<string, PipeConnection[]>();
  type Pipe = { p: CustomPart; role: 'rod' | 'rail'; face: number; depth: number; round: boolean; materialId: string };
  const cache = new Map<number, Pipe[]>();
  const tanAt = (i: number) => { const l = layout.items[i]; return l.axisEnd > l.axisStart ? (l.floorEnd - l.floorStart) / (l.axisEnd - l.axisStart) : 0; };
  const liftAt = (i: number) => { const it = project.items[i] as FenceSection; return Math.min(Math.max(0, it.params.liftMm ?? customLiftOf(it.modelId)), Math.max(0, it.heightMm - 100)); };
  const pipesAt = (i: number): Pipe[] => {
    const cached = cache.get(i); if (cached) return cached;
    const it = project.items[i] as FenceSection; const m = customModelOf(it.modelId);
    if (!m) return [];
    const { cornerConnections: _c, cornerTurns: _t, cornerBends: _b, ...slats } = it.params.slats ?? {};
    const scaled = scaledModel(m, layout.items[i].clearWidth, it.heightMm - liftAt(i), { ...slats, stairTan: tanAt(i) });
    const pipes = scaled.parts.flatMap((p): Pipe[] => {
      const mat = byId.get(p.materialId); if (!mat || p.hw) return [];
      const sh = materialShape(mat); const role = hwRoleOf(p, sh);
      if (sh.type !== 'linear' || (role !== 'rod' && role !== 'rail') || Math.abs(Math.sin(p.angleDeg * Math.PI / 180)) > 0.02) return [];
      const e = sectionFace(sh.section, p.rot + (p.tiltDeg ?? 0));
      return [{ p, role, face: e.face, depth: e.depth, round: !!sh.section.round, materialId: mat.id }];
    });
    cache.set(i, pipes); return pipes;
  };
  const worldAt = (i: number, p: CustomPart, x: number): V3 => {
    const l = layout.items[i]; const pi = plan.items[i]; const c = Math.cos(pi.heading); const s = Math.sin(pi.heading);
    const along = l.clearStart - l.axisStart + x;
    return [pi.start.x + along * c - p.z * s, l.floorStart + l.plinthMm + liftAt(i) + p.y + tanAt(i) * along, pi.start.z + along * s + p.z * c];
  };
  const localVector = (i: number, v: V3): V3 => {
    const h = plan.items[i].heading; return [v[0] * Math.cos(h) + v[2] * Math.sin(h), v[1], -v[0] * Math.sin(h) + v[2] * Math.cos(h)];
  };
  const localPoint = (i: number, v: V3): V3 => {
    const pi = plan.items[i]; const l = layout.items[i];
    const q = localVector(i, [v[0] - pi.start.x, v[1] - l.floorStart - l.plinthMm - liftAt(i), v[2] - pi.start.z]);
    const x = q[0] - (l.clearStart - l.axisStart);
    return [x, q[1] - tanAt(i) * q[0], q[2]];
  };
  for (const it of project.items) if (it.kind === 'fence' && customModelOf(it.modelId)?.kind === 'terrace') wants.set(it.id, []);
  for (let i = 0; i + 1 < project.items.length; i++) {
    const a = project.items[i]; const b = project.items[i + 1];
    if (a.kind !== 'fence' || b.kind !== 'fence' || !wants.has(a.id) || !wants.has(b.id)) continue;
    const ha = plan.items[i].heading; const hb = plan.items[i + 1].heading;
    const ta = tanAt(i); const tb = tanAt(i + 1);
    const incoming = vUnit([Math.cos(ha), ta, Math.sin(ha)]); const outgoing = vUnit([Math.cos(hb), tb, Math.sin(hb)]);
    const angle = jointAngle(incoming, outgoing);
    if (angle < 0.1) continue;
    const model = customModelOf(a.modelId)!; const hw = hwDimsOf(model.hw);
    const mode = project.settings.cornerJoint ?? model.cornerJoint ?? 'ball';
    const used = new Set<string>();
    const xa = layout.items[i].axisEnd - layout.items[i].clearStart;
    const xb = layout.items[i + 1].axisStart - layout.items[i + 1].clearStart;
    for (const pa of pipesAt(i)) {
      const originA = worldAt(i, pa.p, xa);
      const pb = pipesAt(i + 1).filter((p) => !used.has(p.p.id) && p.role === pa.role && p.round === pa.round && Math.abs(p.face - pa.face) < 0.1 && Math.abs(p.depth - pa.depth) < 0.1)
        .sort((p, q) => Math.abs(worldAt(i + 1, p.p, xb)[1] - originA[1]) - Math.abs(worldAt(i + 1, q.p, xb)[1] - originA[1]))[0];
      if (!pb) continue;
      const originB = worldAt(i + 1, pb.p, xb);
      // Različite visine ispune nisu isti spoj: ne praviti lažnu spojnicu između nepovezanih cevi.
      if (Math.abs(originA[1] - originB[1]) > 2) continue;
      const sh = materialShape(byId.get(pa.materialId)!);
      let material: Material | undefined;
      if (pa.round) material = cornerMaterial(materials, mode, pa.face, pa.role, angle);
      else {
        const tags = sizeTags(sh);
        material = materials.filter((m) => m.unit === 'kom' && tags.some((t) => m.name.includes(t)) && /koleno|zglob/.test(norm(m.name))
          && (Math.abs(hb - ha) < 1e-6 || !/gore.?dole/.test(norm(m.name))))
          .sort((m, n) => Number(/podesiv/.test(norm(n.name))) - Number(/podesiv/.test(norm(m.name))))[0];
      }
      // Fiksno koleno od 90°/135° ne predstavlja proizvoljan nagib. Ne upisivati pogrešan kataloški komad.
      if (material && mode === 'elbow') {
        const fixed = material.name.match(/(\d+(?:[.,]\d+)?)\s*°/);
        const bend = fixed ? 180 - Number(fixed[1].replace(',', '.')) : /ostro/.test(norm(material.name)) ? 90 : undefined;
        if (bend !== undefined && Math.abs(bend - angle) > 0.5) material = undefined;
      }
      const label = `${mode === 'ball' && pa.round ? 'Kuglasti zglob' : 'Koleno'} ${pa.role === 'rod' ? 'prečke' : 'rukohvata'} ${pa.round ? `Ø${pa.face}` : `${pa.face}×${pa.depth}`} · ugao ${Math.round(angle * 10) / 10}°`;
      const det = Math.sin(hb - ha);
      let sa = 0; let sb = 0;
      if (Math.abs(det) > 1e-6) {
        const dx = originB[0] - originA[0]; const dz = originB[2] - originA[2];
        sa = (dx * Math.sin(hb) - dz * Math.cos(hb)) / det;
        sb = (dx * Math.sin(ha) - dz * Math.cos(ha)) / det;
      } else if (Math.abs(ta - tb) > 1e-6) {
        sa = sb = (originB[1] - originA[1]) / (ta - tb);
      }
      const ca = vAdd(originA, [sa * Math.cos(ha), sa * ta, sa * Math.sin(ha)]);
      const cb = vAdd(originB, [sb * Math.cos(hb), sb * tb, sb * Math.sin(hb)]);
      // Izmaknute ose zahtevaju prostorni prelaz; jedan standardni kuglasti zglob nije dve spojnice i međukomad.
      if (Math.hypot(...vSub(ca, cb)) > 0.5) material = undefined;
      const requested = mode === 'ball' && pa.round ? ballTakeoff(pa.face, hw.ballArm) : (project.settings.cornerArmMm ?? hw.elbowArm);
      const arm = Math.max(1, Math.min(requested, layout.items[i].clearWidth * Math.hypot(1, ta) * 0.35, layout.items[i + 1].clearWidth * Math.hypot(1, tb) * 0.35));
      const start = vAdd(ca, vScale(incoming, -arm)); const end = vAdd(cb, vScale(outgoing, arm));
      const localStart = localPoint(i, start);
      const localEnd = localPoint(i + 1, end);
      const developedStart = layout.items[i].clearStart + localStart[0];
      const developedVector = (x: number, y: number): V3 => [x - developedStart, y - start[1], 0];
      const developedIncoming = vUnit([1, ta, 0]); const developedOutgoing = vUnit([1, tb, 0]);
      wants.get(a.id)!.push({ on: pa.p.id, side: 'right', xMm: localStart[0], fitting: {
        point: localStart, materialId: material?.id ?? `missing_joint_${pa.role}_${pa.face}_${Math.round(angle * 10)}`, shape: { mode: pa.round ? mode : 'elbow', end: localVector(i, vSub(end, start)),
          incoming: localVector(i, incoming), outgoing: localVector(i, outgoing), centerA: localVector(i, vSub(ca, start)), centerB: localVector(i, vSub(cb, start)),
          faceMm: pa.face, depthMm: pa.depth, round: pa.round, angleDeg: angle, takeoffMm: arm, label, ...(!material ? { requiresMaterial: true } : {}),
          developed: { end: developedVector(layout.items[i + 1].clearStart + localEnd[0], end[1]),
            incoming: developedIncoming, outgoing: developedOutgoing,
            centerA: developedVector(layout.items[i].axisEnd + sa, ca[1]),
            centerB: developedVector(layout.items[i + 1].axisStart + sb, cb[1]),
            angleDeg: jointAngle(developedIncoming, developedOutgoing) } },
      } });
      wants.get(b.id)!.push({ on: pb.p.id, side: 'left', xMm: localEnd[0] });
      used.add(pb.p.id);
    }
  }
  let changed = false;
  const items = project.items.map((it) => {
    if (it.kind !== 'fence') return it;
    const desired = wants.get(it.id);
    if (JSON.stringify(it.params.slats?.cornerConnections) === JSON.stringify(desired)) return it;
    changed = true;
    const { cornerConnections: _old, ...slats } = it.params.slats ?? {};
    return { ...it, params: { ...it.params, slats: { ...slats, ...(desired ? { cornerConnections: desired } : {}) } } };
  });
  return changed ? { ...project, items } : project;
}
