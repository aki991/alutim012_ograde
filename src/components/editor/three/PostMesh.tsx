import { mmToScene as s } from '../../../domain/geometry/gates';
import { colorHex, INOX_COLOR, normalizeColorKey, RAIL_POST_MM } from '../../../domain/models/catalog';
import type { Post } from '../../../domain/models/types';
import { postCapBottom, postCapTop } from '../../../domain/models/postTemplates';
import { boxGeometry, concreteMaterial, darkMaterial, metalMaterial, steelMaterial } from './materials';
import * as THREE from 'three';

const flat = new Map<string, THREE.MeshBasicMaterial>();
function flatMaterial(hex: string): THREE.MeshBasicMaterial {
  let m = flat.get(hex);
  if (!m) { m = new THREE.MeshBasicMaterial({ color: hex, toneMapped: false }); flat.set(hex, m); }
  return m;
}

const tubeGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
// kvadratna piramida (kapa „pismo“) i zarubljena piramida (rozetna), jedinične; razmera se zadaje po stubu
const SQ = Math.SQRT1_2;
const pyramidGeometry = new THREE.ConeGeometry(SQ, 1, 4, 1).rotateY(Math.PI / 4);
const roundPeakGeometry = new THREE.ConeGeometry(0.5, 1, 32, 1);
const rosetteGeometry = new THREE.CylinderGeometry(SQ * 0.72, SQ, 1, 4, 1).rotateY(Math.PI / 4);
const roundRosetteGeometry = new THREE.CylinderGeometry(0.36, 0.5, 1, 32, 1);

/** Kapa na vrhu i rozetna / stopa u dnu metalnog stuba (samo kad je deo izabran iz cenovnika), u boji stuba. */
function PostCaps({ post, d, top, round, material }: { post: Post; d: number; top: number; round: boolean; material: THREE.Material }) {
  const capT = postCapTop(post);
  const capB = postCapBottom(post);
  const o = Math.max(s(4), d * 0.06);
  const band = Math.max(s(14), d * 0.16);
  const cw = d + 2 * o;
  const box = round ? tubeGeometry : boxGeometry;
  return (
    <group>
      {capT && <mesh geometry={box} material={material} scale={[cw, band, cw]} position={[0, top + band / 2, 0]} castShadow />}
      {capT === 'pyramid' && <mesh geometry={round ? roundPeakGeometry : pyramidGeometry} material={material} scale={[cw, d * 0.38, cw]} position={[0, top + band + d * 0.19, 0]} castShadow />}
      {capB === 'rosette' && (() => { const h = Math.max(s(18), d * 0.18); const bw = d + 2 * d * 0.22; return <mesh geometry={round ? roundRosetteGeometry : rosetteGeometry} material={material} scale={[bw, h, bw]} position={[0, h / 2, 0]} castShadow receiveShadow />; })()}
      {capB === 'plate' && <mesh geometry={box} material={material} scale={[d * 1.8, s(12), d * 1.8]} position={[0, s(6), 0]} castShadow receiveShadow />}
    </group>
  );
}

/** Stub (aluminijumski, betonski, dekorativni, stub kapije) sa kapom i pojednostavljenim detaljem montaže. */
export function PostMesh({ post, rails, onPlinth }: { post: Post; rails?: { rodHeightsMm: number[]; railMm: number } | null; /** stub stoji na betonskom podnožju: bez ploče i betonskog bloka koji bi štrčali preko ivice */ onPlinth?: boolean }) {
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
        {!postCapTop(post) && <mesh geometry={tubeGeometry} material={steelMaterial} scale={[d * 1.1, 0.03, d * 1.1]} position={[0, top + 0.01, 0]} castShadow />}
        {!postCapBottom(post) && <mesh geometry={tubeGeometry} material={steelMaterial} scale={[d * 1.9, 0.012, d * 1.9]} position={[0, 0.006, 0]} receiveShadow castShadow />}
        <PostCaps post={post} d={d} top={top} round material={body} />
        {rails?.rodHeightsMm.map((rh) => <mesh key={rh} geometry={tubeGeometry} material={darkMaterial} scale={[d * 1.35, 0.034, d * 1.35]} position={[0, s(rh), 0]} castShadow />)}
      </group>
    );
  }
  if (!masonry && post.type !== 'decorative') {
    // aluminijumski stub i stub kapije: ravna kvadratna greda u boji stuba, bez kape i detalja
    return (
      <group>
        <mesh geometry={boxGeometry} material={body} scale={[w, h, w]} position={[0, h / 2, 0]} castShadow receiveShadow />
        <PostCaps post={post} d={w} top={h} round={false} material={body} />
        {post.mounting === 'concrete_base' && !onPlinth && !postCapBottom(post) && <mesh geometry={boxGeometry} material={darkMaterial} scale={[w + 0.07, 0.012, w + 0.07]} position={[0, 0.006, 0]} receiveShadow />}
        {post.mounting === 'embedded' && !onPlinth && <mesh geometry={boxGeometry} material={concreteMaterial} scale={[w + 0.14, 0.1, w + 0.14]} position={[0, 0.05, 0]} receiveShadow castShadow />}
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
        <mesh geometry={boxGeometry} material={masonry ? concreteMaterial : normalizeColorKey(post.color) === INOX_COLOR ? steelMaterial : body} scale={[w + 0.03, capH, w + 0.03]} position={[0, h + capH / 2, 0]} castShadow />
      )}
      {post.type === 'gate' && <mesh geometry={boxGeometry} material={darkMaterial} scale={[w + 0.004, 0.06, w + 0.004]} position={[0, 0.03, 0]} />}
      {post.mounting === 'concrete_base' && <mesh geometry={boxGeometry} material={darkMaterial} scale={[w + 0.07, 0.012, w + 0.07]} position={[0, 0.006, 0]} receiveShadow />}
      {post.mounting === 'embedded' && <mesh geometry={boxGeometry} material={concreteMaterial} scale={[w + 0.14, 0.1, w + 0.14]} position={[0, 0.05, 0]} receiveShadow castShadow />}
      {post.mounting === 'wall' && <mesh geometry={boxGeometry} material={darkMaterial} scale={[w + 0.05, 0.05, 0.02]} position={[0, 0.3, -w / 2 - 0.01]} />}
    </group>
  );
}
