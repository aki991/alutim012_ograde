import * as THREE from 'three';

/** Podloga 3D prikaza. */
export type GroundKind = 'concrete' | 'grass' | 'tiles';

export const GROUND_LABELS: Record<GroundKind, string> = { concrete: 'Beton', grass: 'Trava', tiles: 'Pločice' };

/** Koliko metara pokriva jedna slika teksture (ponavlja se preko cele podloge). */
const TILE_METERS: Record<GroundKind, number> = { concrete: 4, grass: 3, tiles: 1.2 };
const SIZE = 256;

/** Pseudoslučajni niz (isti izgled pri svakom pokretanju). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paint(kind: GroundKind, ctx: CanvasRenderingContext2D) {
  const rand = rng(kind === 'concrete' ? 11 : kind === 'grass' ? 23 : 37);
  if (kind === 'concrete') {
    ctx.fillStyle = '#b4b8bd';
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 3200; i++) {
      const g = 150 + Math.floor(rand() * 70);
      ctx.fillStyle = `rgba(${g},${g + 2},${g + 6},${0.1 + rand() * 0.25})`;
      const r = 0.6 + rand() * 1.8;
      ctx.fillRect(rand() * SIZE, rand() * SIZE, r, r);
    }
    // dilatacione fuge betonske ploče
    ctx.strokeStyle = 'rgba(70,76,84,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, SIZE - 2, SIZE - 2);
  } else if (kind === 'grass') {
    ctx.fillStyle = '#5a8c38';
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 3600; i++) {
      const x = rand() * SIZE;
      const y = rand() * SIZE;
      const len = 5 + rand() * 9;
      const ang = -Math.PI / 2 + (rand() - 0.5) * 1.1;
      const shade = Math.floor(70 + rand() * 90);
      ctx.strokeStyle = `rgb(${Math.floor(shade * 0.6)},${shade + 40},${Math.floor(shade * 0.35)})`;
      ctx.lineWidth = 1 + rand() * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      ctx.stroke();
    }
  } else {
    // 2 × 2 pločice sa fugom
    const t = SIZE / 2;
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const v = 196 + Math.floor(rand() * 16);
        ctx.fillStyle = `rgb(${v},${v - 5},${v - 14})`;
        ctx.fillRect(i * t, j * t, t, t);
        for (let k = 0; k < 140; k++) {
          ctx.fillStyle = `rgba(120,112,100,${0.04 + rand() * 0.08})`;
          ctx.fillRect(i * t + rand() * t, j * t + rand() * t, 1 + rand() * 2, 1 + rand() * 2);
        }
      }
    }
    ctx.strokeStyle = '#8b877f';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(t, 0); ctx.lineTo(t, SIZE);
    ctx.moveTo(0, t); ctx.lineTo(SIZE, t);
    ctx.moveTo(0, 0); ctx.lineTo(SIZE, 0);
    ctx.moveTo(0, 0); ctx.lineTo(0, SIZE);
    ctx.stroke();
  }
}

const cache = new Map<GroundKind, THREE.CanvasTexture>();

/** Tekstura podloge (jednom napravljena, deli se) sa ponavljanjem po `planeMeters`; null ako platno nije dostupno. */
export function groundTexture(kind: GroundKind, planeMeters = 400): THREE.CanvasTexture | null {
  let tex = cache.get(kind);
  if (!tex) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    paint(kind, ctx);
    tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    const n = planeMeters / TILE_METERS[kind];
    tex.repeat.set(n, n);
    cache.set(kind, tex);
  }
  return tex;
}
