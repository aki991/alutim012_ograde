import * as THREE from 'three';
import { woodColorByHex } from '../../../domain/models/catalog';

/**
 * Tekstura drveta za drvo dekore u 3D prikazu: osnovni ton dekora sa širokim prugama i finim linijama godova u
 * svetlijem i tamnijem tonu iz palete (src/data/drvo-dekori.ts). Vlakna idu duž teksture (u), pa letvica dobija pruge
 * po dužini. Bez platna (testovi, server) nema teksture i ostaje ravna boja.
 */
const cache = new Map<string, THREE.CanvasTexture | null>();

/** deterministički slučajni brojevi (isti dekor uvek ima istu šaru) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function woodTexture(hex: string): THREE.CanvasTexture | null {
  const key = hex.toUpperCase();
  if (cache.has(key)) return cache.get(key)!;
  const decor = woodColorByHex(hex);
  let tex: THREE.CanvasTexture | null = null;
  if (decor?.wood && typeof document !== 'undefined') {
    const W = 1024, H = 256;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const rand = rng([...key].reduce((s, ch) => s * 31 + ch.charCodeAt(0), 7));
      ctx.fillStyle = decor.hex;
      ctx.fillRect(0, 0, W, H);
      // široke pruge (godovi): blagi svetli i tamni pojasevi preko cele dužine
      for (let i = 0; i < 18; i++) {
        const y = rand() * H, h = 6 + rand() * 22;
        ctx.globalAlpha = 0.1 + rand() * 0.14;
        ctx.fillStyle = rand() < 0.5 ? decor.wood.dark : decor.wood.light;
        ctx.fillRect(0, y, W, h);
      }
      // fine linije: kratke i duge crte različite debljine; crtaju se i preko ivice (tekstura se ponavlja)
      for (let i = 0; i < 1400; i++) {
        const y = rand() * H, h = 0.6 + rand() * 2.2, len = 120 + rand() * 900, x = rand() * W;
        ctx.globalAlpha = 0.05 + rand() * 0.2;
        ctx.fillStyle = rand() < 0.6 ? decor.wood.dark : decor.wood.light;
        ctx.fillRect(x, y, len, h);
        if (x + len > W) ctx.fillRect(x - W, y, len, h);
      }
      ctx.globalAlpha = 1;
      tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 8;
    }
  }
  cache.set(key, tex);
  return tex;
}

/**
 * Kako tela daju koordinate teksture: 'box' — jedinična kutija razvučena na meru (0…1 po strani, vlakna duž dužine),
 * 'mm-along' — profil izvučen po dužini (koordinate u mm, dužina je druga koordinata), 'mm-plane' — ploča u ravni crteža (mm).
 */
export type WoodUv = 'box' | 'mm-along' | 'mm-plane';
const variants = new Map<string, THREE.Texture>();

function textureFor(hex: string, uv: WoodUv): THREE.Texture | null {
  const base = woodTexture(hex);
  if (!base || uv === 'box') return base;
  const key = `${hex.toUpperCase()}|${uv}`;
  let t = variants.get(key);
  if (!t) {
    t = base.clone();
    // jedna tekstura ≈ 1000 mm duž vlakana i 120 mm poprečno; kod izvučenog profila dužina je druga koordinata, pa se okreće
    t.center.set(0, 0);
    if (uv === 'mm-along') t.rotation = Math.PI / 2;
    t.repeat.set(1 / 1000, 1 / 120);
    t.needsUpdate = true;
    variants.set(key, t);
  }
  return t;
}

/** boja i tekstura za materijal: drvo dekor dobija teksturu (boja materijala je tada bela, ton nosi tekstura) */
export function woodMaterialProps(hex: string, uv: WoodUv = 'box'): { color: string; map?: THREE.Texture } {
  const map = textureFor(hex, uv);
  return map ? { color: '#ffffff', map } : { color: hex };
}
