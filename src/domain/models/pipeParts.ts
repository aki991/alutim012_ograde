import type { CustomModel, CustomPart } from './custom';
import { materialShape } from './materialShape';
import { hwRoleOf, syncHardware } from './terraceHardware';
import type { Material } from './types';
import type { PipeConnection } from '../geometry/pipeJoints';

/** Obe strane koriste krajeve iz zajedničkog proračuna, bez drugog odbijanja kraka ili dupliranja okova. */
export function applyPipeConnections(model: CustomModel, connections: PipeConnection[], materials: Material[], tan = 0): CustomModel {
  if (!connections.length) return model;
  const connected = new Set(connections.map((c) => c.on));
  const parts = model.parts.filter((p) => !p.hw).map((p) => {
    if (!connected.has(p.id)) return p;
    const fwd = Math.cos(p.angleDeg * Math.PI / 180) > 0;
    const x0 = fwd ? p.x : p.x - p.lengthMm; const x1 = x0 + p.lengthMm;
    const ends = connections.filter((c) => c.on === p.id);
    const left = ends.find((c) => c.side === 'left')?.xMm ?? x0;
    const right = ends.find((c) => c.side === 'right')?.xMm ?? x1;
    return { ...p, x: fwd ? left : right, lengthMm: Math.max(0, right - left) };
  });
  const synced = syncHardware({ ...model, parts }, materials);
  const own = new Map(parts.map((p) => [p.id, p]));
  const kept = synced.parts.filter((p) => {
    if (p.hw?.kind !== 'rodCap' && p.hw?.kind !== 'railCap') return true;
    const parent = own.get(p.hw.on); if (!parent) return true;
    const fwd = Math.cos(parent.angleDeg * Math.PI / 180) > 0;
    const end = p.id.split('~').pop();
    const side = (end === 'a') === fwd ? 'left' : 'right';
    return !connections.some((c) => c.on === parent.id && c.side === side);
  });
  const fittings: CustomPart[] = connections.flatMap((c) => c.fitting ? [{ id: `hw~cornerBall~${c.on}~~b`, materialId: c.fitting.materialId,
    x: c.fitting.point[0], y: c.fitting.point[1], z: c.fitting.point[2], lengthMm: 0, angleDeg: 0, rot: 0,
    hw: { kind: 'cornerBall' as const, on: c.on }, joint3d: c.fitting.shape, ...(tan ? { unshearTan: tan } : {}),
  }] : []);
  return { ...synced, parts: [...kept, ...fittings] };
}

/** Kruti delovi zadržavaju presek; stubovi i njihov okov ostaju ravni i posle ponovne sinhronizacije okova. */
export function rigidTerracePipes(model: CustomModel, materials: Material[], tan = 0): CustomModel {
  if (model.kind !== 'terrace' || !tan) return model;
  const byId = new Map(materials.map((m) => [m.id, m]));
  const angle = Math.atan(tan) * 180 / Math.PI; const factor = Math.hypot(1, tan);
  return { ...model, parts: model.parts.map((p) => {
    if (p.hw && ['flange', 'postCap', 'connector'].includes(p.hw.kind)) return { ...p, unshearTan: tan };
    const mat = byId.get(p.materialId); if (!mat || p.hw || Math.abs(Math.sin(p.angleDeg * Math.PI / 180)) > 0.02) return p;
    const shape = materialShape(mat); const role = hwRoleOf(p, shape);
    return role === 'rail' || role === 'rod' || (shape.type === 'linear' && shape.u) ? { ...p, unshearTan: tan, tube3d: { lengthMm: p.lengthMm * factor, angleDeg: p.angleDeg + angle } } : p;
  }) };
}
