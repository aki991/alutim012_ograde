import { mmToScene as s } from '../../../domain/geometry/gates';
import { colorHex, RAIL_POST_MM } from '../../../domain/models/catalog';
import type { Post, PostCap } from '../../../domain/models/types';
import { boxGeometry, concreteMaterial, darkMaterial, metalMaterial, steelMaterial } from './materials';
import * as THREE from 'three';

const flat = new Map<string, THREE.MeshBasicMaterial>();
function flatMaterial(hex: string): THREE.MeshBasicMaterial {
  let m = flat.get(hex);
  if (!m) { m = new THREE.MeshBasicMaterial({ color: hex, toneMapped: false }); flat.set(hex, m); }
  return m;
}

const tubeGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);

/** Kapa iz kataloga (ravna, pismo, rozetna) od ivice `base` naviše; širina stuba w u jedinicama scene. */
function CapMesh({ kind, w, base, mat }: { kind: PostCap; w: number; base: number; mat: THREE.Material }) {
  if (kind === 'none') return null;
  if (kind === 'pyramid') {
    return <mesh position={[0, base + w * 0.15, 0]} rotation={[0, Math.PI / 4, 0]} material={mat} castShadow><coneGeometry args={[w * 0.78, w * 0.3, 4]} /></mesh>;
  }
  if (kind === 'rosette') {
    return (
      <group>
        <mesh geometry={boxGeometry} material={mat} scale={[w + 0.044, 0.02, w + 0.044]} position={[0, base + 0.01, 0]} castShadow />
        <mesh geometry={boxGeometry} material={mat} scale={[w + 0.016, 0.018, w + 0.016]} position={[0, base + 0.029, 0]} castShadow />
      </group>
    );
  }
  return <mesh geometry={boxGeometry} material={mat} scale={[w + 0.012, 0.022, w + 0.012]} position={[0, base + 0.011, 0]} castShadow />;
}

/** Stub (aluminijumski, betonski, dekorativni, stub kapije) sa kapom i pojednostavljenim detaljem montaže. */
export function PostMesh({ post, rails, caps }: { post: Post; rails?: { rodHeightsMm: number[]; railMm: number } | null; caps?: { top: PostCap; bottom: PostCap } }) {
  const w = s(post.widthMm);
  const h = s(post.heightMm);
  const masonry = post.type === 'concrete' || post.type === 'concrete_plinth' || post.type === 'decorative';
  // boja sa slike modela (#rrggbb): ravna površina bez osvetljenja, kao stub na slici
  const body = masonry ? concreteMaterial : post.color.startsWith('#') ? flatMaterial(post.color) : metalMaterial(colorHex(post.color));
  const capH = Math.min(0.07, w * 0.6);
  if (post.round && !masonry) {
    // srebrni cevni stub: cilindar, kolar na vrhu i podnožna ploča
    const d = rails ? s(RAIL_POST_MM) : Math.min(w, 0.09);
    const top = rails ? h - s(rails.railMm) : h; // uz ogradu sa rukohvatom stub se završava ispod rukohvata
    return (
      <group>
        <mesh geometry={tubeGeometry} material={body} scale={[d, top, d]} position={[0, top / 2, 0]} castShadow receiveShadow />
        <mesh geometry={tubeGeometry} material={steelMaterial} scale={[d * 1.1, 0.03, d * 1.1]} position={[0, top + 0.01, 0]} castShadow />
        <mesh geometry={tubeGeometry} material={steelMaterial} scale={[d * 1.9, 0.012, d * 1.9]} position={[0, 0.006, 0]} receiveShadow castShadow />
        {rails?.rodHeightsMm.map((rh) => <mesh key={rh} geometry={tubeGeometry} material={darkMaterial} scale={[d * 1.35, 0.034, d * 1.35]} position={[0, s(rh), 0]} castShadow />)}
      </group>
    );
  }
  if (!masonry && post.type !== 'decorative') {
    // aluminijumski stub i stub kapije: ravna kvadratna greda u boji stuba, bez kape i detalja
    return (
      <group>
        <mesh geometry={boxGeometry} material={body} scale={[w, h, w]} position={[0, h / 2, 0]} castShadow receiveShadow />
        {caps && <CapMesh kind={caps.top} w={w} base={h} mat={body} />}
        {caps && <CapMesh kind={caps.bottom} w={w} base={0} mat={body} />}
        {post.mounting === 'concrete_base' && <mesh geometry={boxGeometry} material={darkMaterial} scale={[w + 0.07, 0.012, w + 0.07]} position={[0, 0.006, 0]} receiveShadow />}
        {post.mounting === 'embedded' && <mesh geometry={boxGeometry} material={concreteMaterial} scale={[w + 0.14, 0.1, w + 0.14]} position={[0, 0.05, 0]} receiveShadow castShadow />}
        {post.mounting === 'wall' && <mesh geometry={boxGeometry} material={darkMaterial} scale={[w + 0.05, 0.05, 0.02]} position={[0, 0.3, -w / 2 - 0.01]} />}
      </group>
    );
  }
  return (
    <group>
      <mesh geometry={boxGeometry} material={body} scale={[w, h, w]} position={[0, h / 2, 0]} castShadow receiveShadow />
      {post.type === 'decorative' ? (
        <mesh position={[0, h + w * 0.3, 0]} rotation={[0, Math.PI / 4, 0]} material={concreteMaterial} castShadow>
          <coneGeometry args={[w * 0.78, w * 0.6, 4]} />
        </mesh>
      ) : (
        <mesh geometry={boxGeometry} material={masonry ? concreteMaterial : post.color === 'INOX' ? steelMaterial : body} scale={[w + 0.03, capH, w + 0.03]} position={[0, h + capH / 2, 0]} castShadow />
      )}
      {post.type === 'gate' && <mesh geometry={boxGeometry} material={darkMaterial} scale={[w + 0.004, 0.06, w + 0.004]} position={[0, 0.03, 0]} />}
      {post.mounting === 'concrete_base' && <mesh geometry={boxGeometry} material={darkMaterial} scale={[w + 0.07, 0.012, w + 0.07]} position={[0, 0.006, 0]} receiveShadow />}
      {post.mounting === 'embedded' && <mesh geometry={boxGeometry} material={concreteMaterial} scale={[w + 0.14, 0.1, w + 0.14]} position={[0, 0.05, 0]} receiveShadow castShadow />}
      {post.mounting === 'wall' && <mesh geometry={boxGeometry} material={darkMaterial} scale={[w + 0.05, 0.05, 0.02]} position={[0, 0.3, -w / 2 - 0.01]} />}
    </group>
  );
}
