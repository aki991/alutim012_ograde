import { mmToScene as s } from '../../../domain/geometry/gates';
import { colorHex, RAIL_POST_MM } from '../../../domain/models/catalog';
import { capTiers } from '../../../domain/models/tarabica';
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

/** Kvadratni zarubljeni stepenik kape: cilindar sa 4 stranice zaokrenut za 45°, pa su ivice paralelne osama. */
const frustums = new Map<string, THREE.CylinderGeometry>();
function frustumGeometry(bottomW: number, topW: number, h: number): THREE.CylinderGeometry {
  const key = `${bottomW}|${topW}|${h}`;
  let g = frustums.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry((topW / 2) * Math.SQRT2, (bottomW / 2) * Math.SQRT2, h, 4, 1);
    g.rotateY(Math.PI / 4);
    frustums.set(key, g);
  }
  return g;
}

/** Kapa iz kataloga (ravna, pismo, rozetna) od ivice `base` naviše; koristi iste stepenike kao 2D crtež. */
function CapMesh({ kind, wMm, base, mat }: { kind: PostCap; wMm: number; base: number; mat: THREE.Material }) {
  let y = base;
  return (
    <group>
      {capTiers(kind, wMm).map((tier, i) => {
        const cy = y + s(tier.h) / 2;
        y += s(tier.h);
        return <mesh key={i} geometry={frustumGeometry(s(tier.bottomW), s(tier.topW), s(tier.h))} material={mat} position={[0, cy, 0]} castShadow receiveShadow />;
      })}
    </group>
  );
}

/** Stub (aluminijumski, betonski, dekorativni, stub kapije) sa kapom i pojednostavljenim detaljem montaže. */
export function PostMesh({ post, rails, caps, onPlinth }: { post: Post; rails?: { rodHeightsMm: number[]; railMm: number } | null; caps?: { top: PostCap; bottom: PostCap }; /** stub stoji na betonskom podnožju: bez ploče i betonskog bloka koji bi štrčali preko ivice */ onPlinth?: boolean }) {
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
        {caps && <CapMesh kind={caps.top} wMm={post.widthMm} base={h} mat={body} />}
        {caps && <CapMesh kind={caps.bottom} wMm={post.widthMm} base={0} mat={body} />}
        {post.mounting === 'concrete_base' && !onPlinth && <mesh geometry={boxGeometry} material={darkMaterial} scale={[w + 0.07, 0.012, w + 0.07]} position={[0, 0.006, 0]} receiveShadow />}
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
        <mesh geometry={boxGeometry} material={masonry ? concreteMaterial : post.color === 'INOX' ? steelMaterial : body} scale={[w + 0.03, capH, w + 0.03]} position={[0, h + capH / 2, 0]} castShadow />
      )}
      {post.type === 'gate' && <mesh geometry={boxGeometry} material={darkMaterial} scale={[w + 0.004, 0.06, w + 0.004]} position={[0, 0.03, 0]} />}
      {post.mounting === 'concrete_base' && <mesh geometry={boxGeometry} material={darkMaterial} scale={[w + 0.07, 0.012, w + 0.07]} position={[0, 0.006, 0]} receiveShadow />}
      {post.mounting === 'embedded' && <mesh geometry={boxGeometry} material={concreteMaterial} scale={[w + 0.14, 0.1, w + 0.14]} position={[0, 0.05, 0]} receiveShadow castShadow />}
      {post.mounting === 'wall' && <mesh geometry={boxGeometry} material={darkMaterial} scale={[w + 0.05, 0.05, 0.02]} position={[0, 0.3, -w / 2 - 0.01]} />}
    </group>
  );
}
