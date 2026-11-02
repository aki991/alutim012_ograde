import * as THREE from 'three';

/** Deljeni materijali (po boji) — ne prave se iznova pri svakom renderu. */
const metal = new Map<string, THREE.MeshStandardMaterial>();

export function metalMaterial(hex: string): THREE.MeshStandardMaterial {
  let m = metal.get(hex);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55, metalness: 0.35 });
    metal.set(hex, m);
  }
  return m;
}

export const concreteMaterial = new THREE.MeshStandardMaterial({ color: '#b9bdc3', roughness: 1, metalness: 0 });
export const darkMaterial = new THREE.MeshStandardMaterial({ color: '#1f2328', roughness: 0.7, metalness: 0.3 });
export const steelMaterial = new THREE.MeshStandardMaterial({ color: '#c3cbd5', roughness: 0.3, metalness: 0.85 });
export const glassMaterial = new THREE.MeshPhysicalMaterial({ color: '#bfe3ea', transparent: true, opacity: 0.4, roughness: 0.06, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
export const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
export const backingMaterial = new THREE.MeshStandardMaterial({ color: '#cdd7d0', roughness: 1, transparent: true, opacity: 0.35, depthWrite: false });

export const boxGeometry = new THREE.BoxGeometry(1, 1, 1);

/** Mat obojena površina (plastifikacija) bez metalnog sjaja: boja na ekranu ostaje bliska zadatoj. */
const body = new Map<string, THREE.MeshStandardMaterial>();
export function bodyMaterial(hex: string): THREE.MeshStandardMaterial {
  let m = body.get(hex);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.75, metalness: 0.05 });
    body.set(hex, m);
  }
  return m;
}
