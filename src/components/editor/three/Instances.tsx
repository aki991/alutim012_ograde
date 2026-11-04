import { useThree } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { boxGeometry } from './materials';

/** Instancirani delovi: jedan draw call po grupi. Matrice potiču iz zajedničkog opisa ispune (computeInfill). */
export function Instances({ count, build, mat, geometry = boxGeometry }: { count: number; build: (i: number, m: THREE.Matrix4) => void; mat: THREE.Material; geometry?: THREE.BufferGeometry }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((st) => st.invalidate);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) { build(i, m); mesh.setMatrixAt(i, m); }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  });
  if (count === 0) return null;
  return <instancedMesh key={count} ref={ref} args={[geometry, mat, count]} castShadow receiveShadow frustumCulled={false} />;
}
