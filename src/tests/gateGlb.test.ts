import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { adaptLeaf, LEAF_CLEARANCE, type LeafKind } from '../components/editor/three/gateGlb';

const DESIGNS = Array.from({ length: 15 }, (_, i) => String(i + 1).padStart(2, '0'));
const TYPES: { suffix: string; kinds: LeafKind[] }[] = [
  { suffix: 'pesacka', kinds: ['levo'] },
  { suffix: 'jednokrilna', kinds: ['levo'] },
  { suffix: 'dvokrilna', kinds: ['levo', 'desno'] },
  { suffix: 'klizna', kinds: ['klizno'] },
];

function load(file: string): Promise<THREE.Object3D> {
  const buf = readFileSync(new URL(`../assets/gates3d/${file}.glb`, import.meta.url));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  return new Promise((resolve, reject) => new GLTFLoader().parse(ab, '', (g) => resolve(g.scene), reject));
}

describe('GLB krila kapija se prilagođavaju merama projekta', () => {
  // dizajn 02 ima ugrađenu teksturu (dekor drveta) koju Node ne može da dekodira; ostali su bez tekstura
  for (const d of DESIGNS.filter((x) => x !== '02')) {
    it(`dizajn ${d}: sva četiri tipa staju u zadate mere`, async () => {
      for (const t of TYPES) {
        const scene = await load(`${d}-${t.suffix}`);
        for (const kind of t.kinds) {
          const sliding = kind === 'klizno';
          const clearance = sliding ? LEAF_CLEARANCE.slide : LEAF_CLEARANCE.swing;
          const W = 1.3;
          const H = 1.9;
          const g = adaptLeaf(scene, kind, { width: W, height: H, clearance, hex: '#336699', keepDecor: false });
          expect(g, `${d}-${t.suffix}/${kind}`).not.toBeNull();
          g!.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(g!);
          expect(box.max.y).toBeLessThanOrEqual(H + 1e-3);
          expect(box.min.y).toBeGreaterThanOrEqual(0);
          expect(box.min.x).toBeGreaterThanOrEqual(-W / 2 - 0.03); // šarke vire do 15 mm van rama
          expect(box.max.x).toBeLessThanOrEqual(W / 2 + 0.03);
          // ram zauzima celu zadatu širinu i visinu
          const frame = new THREE.Box3();
          g!.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.name.startsWith('Okov_')) frame.expandByObject(o); });
          expect(frame.max.x - frame.min.x).toBeCloseTo(W, 2);
          expect(frame.max.y).toBeCloseTo(H, 2);
          expect(frame.min.y).toBeCloseTo(clearance, 2);
          // letvice i daske se ne preklapaju: ponavljajući uzorak se dodaje/uklanja u celim periodima
          for (const [prefix, axis] of [['Ispuna_zaobljena_letvica', 'x'], ['Ispuna_vertikalna_prava', 'x'], ['Ispuna_uska', 'y'], ['Ispuna_siroka', 'y'], ['Ispuna_horizontalna', 'y']] as const) {
            const boxes: THREE.Box3[] = [];
            g!.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.name.startsWith(prefix)) boxes.push(new THREE.Box3().setFromObject(o)); });
            boxes.sort((a, b) => a.min[axis] - b.min[axis]);
            for (let i = 1; i < boxes.length; i++) expect(boxes[i].min[axis], `${d}-${t.suffix} ${prefix}`).toBeGreaterThanOrEqual(boxes[i - 1].max[axis] - 1e-3);
          }
          // obojeni delovi dobijaju boju iz projekta
          const colored = new Set<number>();
          g!.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m?.color && (o as THREE.Mesh).isMesh && m.name === '' ) colored.add(m.color.getHex()); });
          expect(colored.has(0x336699)).toBe(true);
        }
      }
    });
  }

  it('profili se ne rastežu: debljina bočnog rama ostaje ista pri promeni širine', async () => {
    const scene = await load('01-pesacka');
    const side = (w: number) => {
      const g = adaptLeaf(scene, 'levo', { width: w, height: 1.6, clearance: 0.07, hex: '#000000', keepDecor: false })!;
      const sides: number[] = [];
      g.traverse((o) => { if (o.name.startsWith('Ram_bocni')) sides.push(new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).x); });
      return sides;
    };
    const a = side(0.9);
    const b = side(1.4);
    expect(a).toHaveLength(2);
    expect(b[0]).toBeCloseTo(a[0], 4);
  });

  it('razmak letvica kapije prati zadati razmak (ograda istog modela)', async () => {
    const pitchOf = (g: THREE.Group, prefix: string, axis: 'x' | 'y') => {
      const cs: number[] = [];
      g.updateMatrixWorld(true);
      g.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.name.startsWith(prefix)) cs.push(new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3())[axis]); });
      cs.sort((a, b) => a - b);
      const d = cs.slice(1).map((v, i) => v - cs[i]).sort((a, b) => a - b);
      return d[Math.floor(d.length / 2)];
    };
    const horiz = await load('01-klizna');
    for (const target of [0.1, 0.16]) {
      const g = adaptLeaf(horiz, 'klizno', { width: 3, height: 1.6, clearance: 0.1, hex: '#444444', keepDecor: false, pitch: { axis: 'y', value: target } })!;
      expect(pitchOf(g, 'Ispuna_horizontalna', 'y')).toBeGreaterThan(target * 0.9);
      expect(pitchOf(g, 'Ispuna_horizontalna', 'y')).toBeLessThan(target * 1.1);
    }
    const vert = await load('13-pesacka');
    const gv = adaptLeaf(vert, 'levo', { width: 1, height: 1.6, clearance: 0.07, hex: '#eeeeee', keepDecor: false, pitch: { axis: 'x', value: 0.2 } })!;
    expect(pitchOf(gv, 'Ispuna_zaobljena_letvica', 'x')).toBeGreaterThan(0.18);
    expect(pitchOf(gv, 'Ispuna_zaobljena_letvica', 'x')).toBeLessThan(0.22);
  });
});
