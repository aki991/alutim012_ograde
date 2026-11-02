import * as THREE from 'three';
import { bodyMaterial } from './materials';

/**
 * Prilagođavanje krila iz GLB paketa (ALU TIM 60 modela kapija) merama kapije iz projekta.
 *
 * GLB modeli imaju fiksne mere. Umesto da se ceo model rasteže (što bi rastegnulo i profile i okove):
 *  - delovi koji se protežu kroz ceo ram (okviri, daske, prečke, staklo) rastežu se na novu meru;
 *  - ponavljajući uzorak ispune (letvice, prečke, spojnice) dobija ili gubi cele periode, pa letvice zadržavaju
 *    debljinu i razmak, a ne preklapaju se i ne razmiču;
 *  - okovi (šarke, kvaka, brava, točkovi) zadržavaju meru i samo menjaju položaj u ramu.
 */

export type LeafKind = 'levo' | 'desno' | 'klizno';

const EDGE_EPS = 0.01; // m, tolerancija za delove koji vire malo van rama
const EDGE_NEAR = 0.03; // m, deo uz ivicu rama zadržava razmak od ivice
const SPAN_RATIO = 0.6;

export interface LeafTarget {
  /** širina rama krila (m) */
  width: number;
  /** visina od tla do vrha krila (m) */
  height: number;
  /** razmak donje ivice rama od tla (m) */
  clearance: number;
  /** hex boja obojenih delova (plastifikacija) */
  hex: string;
  /** boja je dekor drveta: zadrži teksturu iz modela */
  keepDecor: boolean;
  /** boja je inox: zadrži brušeni inox na ispuni i ramu (inače se te površine boje) */
  keepInox?: boolean;
  /** zadat razmak letvica duž ose (m): uzorak iz modela se preskalira na taj razmak */
  pitch?: { axis: Axis; value: number };
}

export const LEAF_CLEARANCE = { swing: 0.07, slide: 0.1 };

export function findLeaf(root: THREE.Object3D, kind: LeafKind): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  root.traverse((o) => {
    if (!found && o.name.startsWith(`Krilo_${kind}`)) found = o;
  });
  return found;
}

type Axis = 'x' | 'y';

interface Item {
  mesh: THREE.Mesh;
  /** matrica dela u prostoru roditelja krila (već pomerena/umnožena) */
  m: THREE.Matrix4;
  box: THREE.Box3;
  /** okov koji zadržava meru (šarke, kvaka…); spojnice prate uzorak */
  hardware: boolean;
  /** za koliko se deo koji se proteže kroz ram produžava po osi (m) */
  grow: { x: number; y: number };
}

const keyOf = (name: string) => name.replace(/\d+$/, '');
const isHardware = (name: string) => name.startsWith('Okov_') && !name.startsWith('Okov_spojnica');
const lo = (b: THREE.Box3, a: Axis) => b.min[a];
const hi = (b: THREE.Box3, a: Axis) => b.max[a];
const mid = (b: THREE.Box3, a: Axis) => (b.min[a] + b.max[a]) / 2;

function translated(it: Item, axis: Axis, d: number): Item {
  const v = new THREE.Vector3(axis === 'x' ? d : 0, axis === 'y' ? d : 0, 0);
  return { ...it, m: new THREE.Matrix4().makeTranslation(v.x, v.y, 0).multiply(it.m), box: it.box.clone().translate(v), grow: { ...it.grow } };
}

/** Preslikavanje jedne ose: ram [f0,f1] → cilj [t0,t1]. Vraća faktor rastezanja i novi centar dela. */
function mapAxis(min: number, max: number, f0: number, f1: number, t0: number, t1: number, canScale: boolean) {
  const F = f1 - f0;
  const T = t1 - t0;
  const size = max - min;
  const oc = (min + max) / 2;
  const span = canScale && F > 1e-6 && size >= SPAN_RATIO * F;
  const k = span ? T / F : 1;
  const ns = size * k;
  let c: number;
  if (oc < f0 - EDGE_EPS) c = t0 + (oc - f0); // izvan rama (točkovi ispod): zadrži odstojanje
  else if (oc > f1 + EDGE_EPS) c = t1 + (oc - f1);
  else if (span) c = t0 + ((oc - f0) / F) * T; // proteže se kroz ram: srazmerno
  else if (min - f0 < EDGE_NEAR) c = t0 + (min - f0) + ns / 2; // uz levu/donju ivicu: ista udaljenost od ivice
  else if (f1 - max < EDGE_NEAR) c = t1 - (f1 - max) - ns / 2;
  else c = F > 1e-6 ? t0 + ((oc - f0) / F) * T : oc;
  return { k, c };
}

/** Period (korak) ponavljajućeg uzorka duž ose: korak najbrojnije grupe istih delova. 0 ako uzorka nema. */
function patternPitch(items: Item[], axis: Axis, f0: number, f1: number): { P: number; key: string } {
  const F = f1 - f0;
  const groups = new Map<string, number[]>();
  for (const it of items) {
    if (it.hardware) continue;
    const size = hi(it.box, axis) - lo(it.box, axis);
    if (size >= SPAN_RATIO * F || lo(it.box, axis) - f0 < EDGE_NEAR || f1 - hi(it.box, axis) < EDGE_NEAR) continue;
    const key = `${keyOf(it.mesh.name)}|${Math.round(size * 1000)}`;
    const list = groups.get(key) ?? [];
    const c = mid(it.box, axis);
    if (!list.some((v) => Math.abs(v - c) < 0.001)) list.push(c);
    groups.set(key, list);
  }
  let main: number[] = [];
  let mainKey = '';
  for (const [key, list] of groups) if (list.length > main.length) { main = list; mainKey = key; }
  if (main.length < 3) return { P: 0, key: '' };
  main.sort((a, b) => a - b);
  const diffs = main.slice(1).map((v, i) => v - main[i]).sort((a, b) => a - b);
  return { P: diffs[Math.floor(diffs.length / 2)], key: mainKey.split('|')[0] };
}

/** Rasteže razmak uzorka za faktor f oko ivice rama; veličine delova ostaju, osim delova uzorka i onih koji se protežu kroz ram. */
function rescalePattern(items: Item[], axis: Axis, f0: number, f1: number, f: number, patternKey: string): Item[] {
  const F = f1 - f0;
  return items.map((it) => {
    const size = hi(it.box, axis) - lo(it.box, axis);
    const c = mid(it.box, axis);
    const span = !it.hardware && size >= SPAN_RATIO * F;
    const isPattern = !it.hardware && !span && keyOf(it.mesh.name) === patternKey;
    let nc: number;
    let ns = size;
    if (span) { nc = f0 + (c - f0) * f; ns = size * f; }
    else if (isPattern) { nc = f0 + (c - f0) * f; ns = size * f; }
    else if (!it.hardware && lo(it.box, axis) - f0 < EDGE_NEAR) nc = lo(it.box, axis) + size / 2;
    else if (!it.hardware && f1 - hi(it.box, axis) < EDGE_NEAR) nc = f0 + F * f - (f1 - hi(it.box, axis)) - size / 2;
    else nc = f0 + (c - f0) * f;
    const s = size > 1e-6 ? ns / size : 1;
    const v = (x: number) => (axis === 'x' ? new THREE.Vector3(x, 0, 0) : new THREE.Vector3(0, x, 0));
    const scale = new THREE.Vector3(axis === 'x' ? s : 1, axis === 'y' ? s : 1, 1);
    const m = new THREE.Matrix4().makeTranslation(...v(nc).toArray())
      .multiply(new THREE.Matrix4().makeScale(scale.x, scale.y, 1))
      .multiply(new THREE.Matrix4().makeTranslation(...v(-c).toArray()))
      .multiply(it.m);
    const box = it.box.clone();
    box.min[axis] = nc - ns / 2;
    box.max[axis] = nc + ns / 2;
    return { ...it, m, box };
  });
}

/**
 * Dodaje ili uklanja cele periode uzorka duž ose tako da ukupna dužina bude što bliža cilju.
 * Vraća nove delove i dužinu za koju je ram produžen (ili skraćen).
 */
function repeatPattern(items: Item[], axis: Axis, f0: number, f1: number, target: number): { items: Item[]; ext: number } {
  const F = f1 - f0;
  const isSpan = (it: Item) => hi(it.box, axis) - lo(it.box, axis) >= SPAN_RATIO * F;
  const edge = (it: Item) => lo(it.box, axis) - f0 < EDGE_NEAR || f1 - hi(it.box, axis) < EDGE_NEAR;
  const cand = new Set(items.filter((it) => !it.hardware && !isSpan(it) && !edge(it)));

  // grupe istog dela i iste mere po osi; najbrojnija grupa daje period (korak) uzorka
  const groups = new Map<string, number[]>();
  for (const it of cand) {
    const key = `${keyOf(it.mesh.name)}|${Math.round((hi(it.box, axis) - lo(it.box, axis)) * 1000)}`;
    const list = groups.get(key) ?? [];
    const c = mid(it.box, axis);
    if (!list.some((v) => Math.abs(v - c) < 0.001)) list.push(c);
    groups.set(key, list);
  }
  let main: number[] = [];
  for (const list of groups.values()) if (list.length > main.length) main = list;
  if (main.length < 3) return { items, ext: 0 };
  main.sort((a, b) => a - b);
  const diffs = main.slice(1).map((v, i) => v - main[i]).sort((a, b) => a - b);
  const P = diffs[Math.floor(diffs.length / 2)];
  if (P < 0.01) return { items, ext: 0 };

  const k = Math.max(Math.round((target - F) / P), -(main.length - 2)); // ostavi bar dva elementa uzorka
  if (k === 0) return { items, ext: 0 };

  // mesto reza: sredina uzorka; pri uklanjanju prozor mora da stane u uzorak
  const m = Math.min(main.length - 1, Math.max(Math.floor(main.length / 2), -k - 1));
  const cut = main[m] + 0.25 * P;
  const ext = k * P;
  const out: Item[] = [];
  for (const it of items) {
    if (it.hardware) { out.push(it); continue; }
    if (isSpan(it)) { out.push({ ...it, grow: { ...it.grow, [axis]: it.grow[axis] + ext } }); continue; }
    const c = mid(it.box, axis);
    const inPattern = cand.has(it);
    if (k < 0 && inPattern && c >= cut + ext && c < cut) continue; // uklonjen period
    out.push(c >= cut ? translated(it, axis, ext) : it);
    if (k > 0 && inPattern && c >= cut - P && c < cut) for (let j = 1; j <= k; j++) out.push(translated(it, axis, j * P));
  }
  return { items: out, ext };
}

/**
 * Vraća grupu centriranu po x (ram od −w/2 do +w/2), sa donjom ivicom rama na `clearance` i vrhom na `height`,
 * centriranu po z oko ose rama. Delovi dele geometriju sa učitanim modelom.
 */
export function adaptLeaf(source: THREE.Object3D, kind: LeafKind, t: LeafTarget): THREE.Group | null {
  const leaf = findLeaf(source, kind);
  if (!leaf) return null;
  source.updateWorldMatrix(true, true);
  const rootInv = new THREE.Matrix4().copy(source.matrixWorld).invert();

  let items: Item[] = [];
  leaf.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const m = new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld);
    items.push({ mesh, m, box: mesh.geometry.boundingBox!.clone().applyMatrix4(m), hardware: isHardware(mesh.name), grow: { x: 0, y: 0 } });
  });
  if (!items.length) return null;

  // ram krila = sve osim okova (šarke, kvake, točkovi) koji mogu da vire van ivica
  const frame = new THREE.Box3();
  const computeFrame = () => { frame.makeEmpty(); for (const p of items) if (!p.mesh.name.startsWith('Okov_')) frame.union(p.box); };
  computeFrame();
  if (frame.isEmpty()) return null;

  // razmak letvica zadat spolja (prema ogradi istog modela): uzorak iz modela se preskalira na taj razmak
  if (t.pitch && t.pitch.value > 0.01) {
    const ax = t.pitch.axis;
    const pp = patternPitch(items, ax, frame.min[ax], frame.max[ax]);
    if (pp.P > 0.01) {
      const f = Math.min(2.5, Math.max(0.4, t.pitch.value / pp.P));
      items = rescalePattern(items, ax, frame.min[ax], frame.max[ax], f, pp.key);
      computeFrame();
    }
  }

  const rx = repeatPattern(items, 'x', frame.min.x, frame.max.x, t.width);
  items = rx.items;
  const ry = repeatPattern(items, 'y', frame.min.y, frame.max.y, t.height - t.clearance);
  items = ry.items;

  const out = new THREE.Group();
  const zc = (frame.min.z + frame.max.z) / 2;
  const quat = new THREE.Quaternion();
  const mats = new Map<THREE.Material, THREE.Material>();
  const BODY_EXCLUDED = /^(Okov_|Kapa_|Stub_|Stopa_)/;
  const colored = (src: THREE.Material, meshName: string): THREE.Material => {
    const body = !BODY_EXCLUDED.test(meshName);
    let r = body ? mats.get(src) : undefined;
    if (!r) {
      const n = src.name;
      if (n.includes('plastifikacija') && body) r = bodyMaterial(t.hex);
      else if (n.startsWith('Dekor') && !t.keepDecor) r = bodyMaterial(t.hex);
      else if (n.includes('inox') && body && !t.keepInox) r = bodyMaterial(t.hex);
      else r = src;
      if (body) mats.set(src, r);
    }
    return r;
  };
  const small = (v: number) => Math.abs(v) < 1e-3;

  for (const p of items) {
    quat.setFromRotationMatrix(p.m);
    // rastezanje po osi sme samo ako rotacija dela ne uzrokuje smicanje (0°/90° ili nagib oko x za lamele)
    const rot = new THREE.Matrix4().makeRotationFromQuaternion(quat).elements;
    const axisAligned = rot.every((v) => small(v) || small(Math.abs(v) - 1));
    const aboutX = small(quat.y) && small(quat.z);
    // delovi koji se protežu kroz ram produžuju se zajedno sa ramom; okovi se mapiraju na prvobitni ram
    const fx1 = frame.max.x + (p.hardware ? 0 : rx.ext);
    const fy1 = frame.max.y + (p.hardware ? 0 : ry.ext);
    const box = p.box.clone();
    box.max.x += p.grow.x;
    box.max.y += p.grow.y;
    const ax = mapAxis(box.min.x, box.max.x, frame.min.x, fx1, -t.width / 2, t.width / 2, axisAligned || aboutX);
    const ay = mapAxis(box.min.y, box.max.y, frame.min.y, fy1, t.clearance, t.height, axisAligned);
    const oldW = p.box.max.x - p.box.min.x;
    const oldH = p.box.max.y - p.box.min.y;
    const gx = oldW > 1e-6 ? (box.max.x - box.min.x) / oldW : 1; // produženje dela koji se proteže kroz ram
    const gy = oldH > 1e-6 ? (box.max.y - box.min.y) / oldH : 1;
    const adj = new THREE.Matrix4()
      .makeTranslation(ax.c, ay.c, -zc)
      .multiply(new THREE.Matrix4().makeScale(gx * ax.k, gy * ay.k, 1))
      .multiply(new THREE.Matrix4().makeTranslation(-mid(p.box, 'x'), -mid(p.box, 'y'), 0))
      .multiply(p.m);
    const mesh = new THREE.Mesh(p.mesh.geometry, colored(p.mesh.material as THREE.Material, p.mesh.name));
    mesh.name = p.mesh.name;
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(adj);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if ((mesh.material as THREE.Material).transparent) mesh.renderOrder = 2;
    out.add(mesh);
  }
  return out;
}
