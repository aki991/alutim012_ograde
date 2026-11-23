/** Zajednička geometrija ugaonog spoja za prikaz i krojne mere. Sve dužine su u mm. */
export type V3 = [number, number, number];
export interface PipeJointShape {
  mode: 'ball' | 'elbow';
  end: V3;
  incoming: V3;
  outgoing: V3;
  centerA: V3;
  centerB: V3;
  faceMm: number;
  depthMm: number;
  round: boolean;
  angleDeg: number;
  takeoffMm: number;
  label?: string;
  requiresMaterial?: boolean;
  /** Razvijeni 2D crtež: susedno polje se odmotava duž trase, umesto projekcije na X osu dolazećeg polja. */
  developed?: Pick<PipeJointShape, 'end' | 'incoming' | 'outgoing' | 'centerA' | 'centerB' | 'angleDeg'>;
}
export interface PipeConnection {
  on: string;
  side: 'left' | 'right';
  /** Kraj ravne cevi u horizontalnoj koordinati polja, posle odbijanja dužine spoja. */
  xMm: number;
  fitting?: { point: V3; shape: PipeJointShape; materialId: string };
}
export const vAdd = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vSub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vScale = (a: V3, n: number): V3 => [a[0] * n, a[1] * n, a[2] * n];
export const vUnit = (a: V3): V3 => vScale(a, 1 / Math.max(1e-12, Math.hypot(...a)));
export const vDot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const jointAngle = (a: V3, b: V3): number => Math.acos(Math.max(-1, Math.min(1, vDot(vUnit(a), vUnit(b))))) * 180 / Math.PI;
export const ballTakeoff = (diameter: number, given = 0): number => given > 0 ? given : diameter * 0.65 + Math.max(8, diameter * 0.25);

/** Jedna kugla i dva vrata do postojećih krajeva cevi, čak i kada im se prostorne ose mimoilaze. */
export function ballJointGeometry(j: PipeJointShape): { center: V3; necks: [V3, V3, V3, V3][] } {
  const center = vScale(vAdd(j.centerA, j.centerB), 0.5);
  const first = Math.hypot(...center) / 3;
  const last = Math.hypot(...vSub(j.end, center)) / 3;
  return { center, necks: [
    [[0, 0, 0], vScale(j.incoming, first), vScale(center, 2 / 3), center],
    [center, vAdd(center, vScale(vSub(j.end, center), 1 / 3)), vSub(j.end, vScale(j.outgoing, last)), j.end],
  ] };
}

/** Kontrolne tačke kružnog luka (ili prostornog prelaza kod istovremenog skretanja i promene nagiba). */
export function jointControls(j: PipeJointShape): [V3, V3, V3, V3] {
  const theta = j.angleDeg * Math.PI / 180;
  const ratio = theta > 1e-5 ? 4 / 3 * Math.tan(theta / 4) / Math.tan(theta / 2) : 2 / 3;
  const handle = Math.max(0.01, j.takeoffMm * ratio);
  return [[0, 0, 0], vScale(j.incoming, handle), vSub(j.end, vScale(j.outgoing, handle)), j.end];
}
