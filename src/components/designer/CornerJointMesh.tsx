import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { ballJointGeometry, jointControls, type PipeJointShape, type V3 } from '../../domain/geometry/pipeJoints';

const sphere = new THREE.SphereGeometry(1, 32, 24);
const vector = (v: V3) => new THREE.Vector3(...v);

/** Pravougaoni rukohvat ostaje pravougaonog preseka; okvir preseka se prenosi duž prostornog luka bez uvrtanja. */
function rectangularSweep(curve: THREE.CubicBezierCurve3, face: number, depth: number): THREE.BufferGeometry {
  const count = 40; const vertices: number[] = []; const indices: number[] = [];
  let tangent = curve.getTangent(0).normalize();
  let z = new THREE.Vector3(0, 0, 1).addScaledVector(tangent, -tangent.z).normalize();
  if (z.lengthSq() < 0.5) z = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
  for (let i = 0; i <= count; i++) {
    const next = curve.getTangent(i / count).normalize();
    z.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(tangent, next)).normalize(); tangent = next;
    const normal = z.clone().cross(tangent).normalize(); const center = curve.getPoint(i / count);
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = center.clone().addScaledVector(normal, u * face / 2).addScaledVector(z, v * depth / 2);
      vertices.push(p.x, p.y, p.z);
    }
    if (i) for (let j = 0; j < 4; j++) { const a = (i - 1) * 4 + j; const b = (i - 1) * 4 + (j + 1) % 4; indices.push(a, a + 4, b + 4, a, b + 4, b); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.setIndex(indices); g.computeVertexNormals(); return g;
}

/** Fiting je jedno telo između tačnih krajeva cevi; kugla se ne smiče, a koleno ima neprekinut luk i tangente. */
export function CornerJointMesh({ joint, material }: { joint: PipeJointShape; material: THREE.Material }) {
  const ball = joint.mode === 'ball' && joint.round ? ballJointGeometry(joint) : null;
  const geometries = useMemo(() => {
    const isBall = joint.mode === 'ball' && joint.round;
    const controls = isBall ? ballJointGeometry(joint).necks : [jointControls(joint)];
    return controls.map((control) => {
      const points = control.map(vector) as [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
      const curve = new THREE.CubicBezierCurve3(...points);
      return joint.round ? new THREE.TubeGeometry(curve, 40, joint.faceMm / 2 * (isBall ? 1.04 : 1), 32, false) : rectangularSweep(curve, joint.faceMm, joint.depthMm);
    });
  }, [joint]);
  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries]);
  const radius = joint.faceMm / 2;
  return <>
    {geometries.map((geometry, i) => <mesh key={i} geometry={geometry} material={material} castShadow />)}
    {ball && <mesh geometry={sphere} material={material} position={ball.center} scale={radius * 1.3} userData={{ jointBall: true }} castShadow />}
  </>;
}
