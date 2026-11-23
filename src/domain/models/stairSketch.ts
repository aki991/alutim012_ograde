import { partBounds, type CustomModel, type CustomPart } from './custom';
import { materialShape } from './materialShape';
import { hwRoleOf } from './terraceHardware';
import type { Material } from './types';

/** Razvijen pogled stepeništa za skicu: iste ose i dužine kao u editoru i krojnoj listi. */
export function developStairSketch(model: CustomModel, materials: Material[], tan: number): CustomModel {
  if (!tan) return model;
  const byId = new Map(materials.map((m) => [m.id, m]));
  const degrees = (a: number) => a * 180 / Math.PI;
  const transformAngle = (a: number) => {
    const rad = a * Math.PI / 180;
    return degrees(Math.atan2(Math.sin(rad) + tan * Math.cos(rad), Math.cos(rad)));
  };
  const parts = model.parts.map((source): CustomPart => {
    const { tube3d, unshearTan, ...part } = source;
    const material = byId.get(part.materialId);
    const shape = material && materialShape(material);
    const out = { ...part, y: part.y + tan * part.x };
    if (tube3d) return { ...out, ...tube3d };
    if (shape?.type === 'sheet') return { ...out, sheetShearMm: tan * part.lengthMm };
    if (shape?.type !== 'linear' || part.joint3d || unshearTan) return out;
    const rad = part.angleDeg * Math.PI / 180;
    const flat = Math.abs(Math.sin(rad)) < 0.02;
    const vertical = Math.abs(Math.cos(rad)) < 0.02;
    const role = hwRoleOf(part, shape);
    if (role === 'post') return out;
    if (flat && (role === 'rail' || role === 'rod')) return {
      ...out, angleDeg: transformAngle(part.angleDeg), lengthMm: part.lengthMm * Math.hypot(1, tan),
    };
    return {
      ...out,
      angleDeg: transformAngle(part.angleDeg),
      lengthMm: part.lengthMm * Math.hypot(Math.cos(rad), Math.sin(rad) + tan * Math.cos(rad)),
      ...(part.cutStartDeg !== undefined ? { cutStartDeg: transformAngle(part.cutStartDeg) } : flat ? { cutStartDeg: 90 } : vertical ? { cutStartDeg: degrees(Math.atan(tan)) } : {}),
      ...(part.cutEndDeg !== undefined ? { cutEndDeg: transformAngle(part.cutEndDeg) } : flat ? { cutEndDeg: 90 } : vertical ? { cutEndDeg: degrees(Math.atan(tan)) } : {}),
    };
  });
  const bounds = parts.flatMap((p) => { const m = byId.get(p.materialId); return m ? [partBounds(p, materialShape(m))] : []; });
  const bottom = Math.min(0, ...bounds.map((b) => b.y0));
  const top = Math.max(model.heightMm, ...bounds.map((b) => b.y1));
  return { ...model, stairSketchTan: tan, heightMm: Math.ceil(top - bottom), parts: parts.map((p) => ({ ...p, y: p.y - bottom })) };
}
