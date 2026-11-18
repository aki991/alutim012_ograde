import { LEAF_GAP_MM } from '../geometry/gates';
import { uid } from '../../utils/id';
import { resizeWithFrame } from './frame';
import { leafSeed } from './leafSeed';
import { hingesAlongEdge, restOnSurface } from './surface';
import { hingeCountFor } from '../gates/hingeRule';
import { bodyParts, isPairHardware, pairRoleOf, pairWidth, ROLE_LABEL, type PairLayout, type PairRole } from './pairHardware';
import type { CustomModel, CustomPart } from './custom';
import type { Material } from './types';

/**
 * Dvokrilna kapija nacrtana kao dva odvojena krila u jednom crtežu (Doradi): levo krilo, srednji zazor, desno krilo. Svako krilo ima svoj ram i
 * svoju ispunu, a okov je pravi deo iz cenovnika na svom krilu: šarke (po dve na spoljnoj ivici svakog krila), brava sa kvakom na aktivnom krilu
 * uz unutrašnju ivicu, prihvatnik brave na pasivnom krilu u istoj visini, vertikalni podni zasun uz spoj na pasivnom krilu i podni prihvat ispod njega.
 */

/** izbor materijala okova (ID po ulozi); za ulogu bez izbora uzima se prvi materijal iz cenovnika sa odgovarajućim nazivom */
export type PairPick = Partial<Record<PairRole, string>>;

export function defaultPairPick(materials: Material[]): { pick: PairPick; missing: string[] } {
  const pick: PairPick = {};
  for (const m of materials) {
    const r = pairRoleOf(m);
    if (r && !pick[r]) pick[r] = m.id;
  }
  const missing = (Object.keys(ROLE_LABEL) as PairRole[]).filter((r) => !pick[r]).map((r) => ROLE_LABEL[r]);
  return { pick, missing };
}

const LOCK_INSET = 55;

const piece = (materialId: string, x: number, y: number): CustomPart => ({ id: uid('part'), materialId, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, lengthMm: 0, angleDeg: 0, rot: 0, z: 0 });

/**
 * Okov para krila na svoja mesta (stari okov para se ne zadržava). `activeSide`: strana aktivnog krila, gledano sa ulice.
 * Delovi tela krila ostaju kakvi jesu.
 */
export function withPairHardware(model: CustomModel, l: PairLayout, activeSide: 'left' | 'right', pick: PairPick, materials: Material[]): CustomModel {
  const { left, right } = bodyParts(model.parts, materials, l);
  const body = [...left, ...right];
  const H = model.heightMm;
  const mat = (r: PairRole): Material | undefined => materials.find((m) => m.id === pick[r]);
  const out: CustomPart[] = [...body];
  const rightX0 = l.leftMm + l.gapMm;
  const lockY = Math.min(1000, H * 0.55);
  // šarke na spoljnim ivicama: svako krilo samo svoje delove kao osnovu, da šarka legne na njegov ram
  const hinge = mat('hinge');
  if (hinge) {
    out.push(...hingesAlongEdge({ ...model, parts: left }, hinge, 'left', hingeCountFor(l.leftMm, H), materials));
    out.push(...hingesAlongEdge({ ...model, parts: right }, hinge, 'right', hingeCountFor(l.rightMm, H), materials));
  }
  const activeInner = activeSide === 'left' ? l.leftMm - LOCK_INSET : rightX0 + LOCK_INSET;
  const passiveInner = activeSide === 'left' ? rightX0 + LOCK_INSET : l.leftMm - LOCK_INSET;
  const add = (r: PairRole, x: number, y: number) => {
    const m = mat(r);
    if (!m) return;
    out.push(restOnSurface({ parts: out }, piece(m.id, x, y), materials));
  };
  add('lock', activeInner, lockY - 220); // brava se crta od donje ivice: sredina rozete u visini ose brave
  add('strike', passiveInner, lockY - 60);
  // zasun i podni prihvat uz spoj, na pasivnom krilu, dvorišna strana (dubina se postavlja sama)
  const boltX = activeSide === 'left' ? rightX0 + 80 : l.leftMm - 80;
  add('catch', boltX, 0);
  add('bolt', boltX, 12);
  return { ...model, parts: out };
}

/**
 * Okov pešačke / jednokrilne kapije na crtežu: 2 šarke na strani šarki (`hingeSide`) i brava sa kvakom uz slobodnu ivicu, u visini brave.
 * Stari okov se ne zadržava.
 */
export function withSingleHardware(model: CustomModel, hingeSide: 'left' | 'right', pick: PairPick, materials: Material[]): CustomModel {
  const body = model.parts.filter((p) => !isPairHardware(p, materials));
  const base: CustomModel = { ...model, parts: body };
  const out: CustomPart[] = [...body];
  const hinge = materials.find((m) => m.id === pick.hinge);
  if (hinge) out.push(...hingesAlongEdge(base, hinge, hingeSide, hingeCountFor(model.widthMm, model.heightMm), materials));
  const lock = materials.find((m) => m.id === pick.lock);
  if (lock) {
    const x = hingeSide === 'right' ? LOCK_INSET : model.widthMm - LOCK_INSET;
    out.push(restOnSurface({ parts: out }, piece(lock.id, x, Math.min(1000, model.heightMm * 0.55) - 220), materials));
  }
  return { ...model, parts: out };
}

/** nov crtež pešačke / jednokrilne kapije sa okovom; `missing` su okovi kojih nema u cenovniku */
export function singleGateSeed(fenceId: string, list: readonly CustomModel[] | undefined, materials: Material[], id: string, widthMm: number, heightMm: number): { model: CustomModel; missing: string[] } | { error: string } {
  const leaf = leafSeed(fenceId, list, materials, id, widthMm, heightMm);
  if ('error' in leaf) return leaf;
  const { pick } = defaultPairPick(materials);
  const missing = (['hinge', 'lock'] as PairRole[]).filter((r) => !pick[r]).map((r) => ROLE_LABEL[r]);
  return { model: withSingleHardware(leaf, 'right', pick, materials), missing };
}

/** nov crtež dvokrilne kapije: oba krila od izabrane ograde i sav okov para; `missing` su okovi kojih nema u cenovniku */
export function doubleGateSeed(fenceId: string, list: readonly CustomModel[] | undefined, materials: Material[], id: string, clearMm: number, heightMm: number): { model: CustomModel; layout: PairLayout; missing: string[] } | { error: string } {
  const gapMm = LEAF_GAP_MM;
  const w = Math.round((clearMm - gapMm) / 2);
  const a = leafSeed(fenceId, list, materials, `${id}a`, w, heightMm);
  if ('error' in a) return a;
  const b = leafSeed(fenceId, list, materials, `${id}b`, w, heightMm);
  if ('error' in b) return b;
  const layout: PairLayout = { leftMm: w, rightMm: w, gapMm };
  const shift = w + gapMm;
  const parts = [...a.parts, ...b.parts.map((p) => ({ ...p, x: p.x + shift }))];
  const { pick, missing } = defaultPairPick(materials);
  const base: CustomModel = { ...a, id, widthMm: pairWidth(layout), heightMm, parts };
  return { model: withPairHardware(base, layout, 'left', pick, materials), layout, missing };
}

/** okov para koji je već u crtežu (ID materijala po ulozi); za ulogu bez dela važi izbor iz cenovnika */
export function pickFromModel(model: CustomModel, materials: Material[]): PairPick {
  const pick: PairPick = { ...defaultPairPick(materials).pick };
  for (const p of model.parts) {
    const r = pairRoleOf(materials.find((m) => m.id === p.materialId));
    if (r) pick[r] = p.materialId;
  }
  return pick;
}

/**
 * Nove širine krila: svako krilo se razvlači posebno (ram zadržava debljinu), desno se pomera, a okov para se postavlja iznova na ivice.
 * Vraća grešku (npr. premala mera za ram).
 */
export function resizePair(model: CustomModel, l: PairLayout, next: { leftMm: number; rightMm: number; heightMm?: number }, activeSide: 'left' | 'right', materials: Material[]): { model: CustomModel; layout: PairLayout } | { error: string } {
  const { left, right } = bodyParts(model.parts, materials, l);
  const H = next.heightMm ?? model.heightMm;
  const sub = (parts: CustomPart[], dx: number, width: number): CustomModel => ({ ...model, widthMm: width, parts: parts.map((p) => ({ ...p, x: p.x - dx })) });
  const ra = resizeWithFrame(sub(left, 0, l.leftMm), next.leftMm, H, materials);
  if ('error' in ra) return ra;
  const rb = resizeWithFrame(sub(right, l.leftMm + l.gapMm, l.rightMm), next.rightMm, H, materials);
  if ('error' in rb) return rb;
  const layout: PairLayout = { leftMm: next.leftMm, rightMm: next.rightMm, gapMm: l.gapMm };
  const shift = next.leftMm + l.gapMm;
  const merged: CustomModel = { ...model, widthMm: pairWidth(layout), heightMm: H, parts: [...ra.parts, ...rb.parts.map((p) => ({ ...p, x: p.x + shift }))] };
  return { model: withPairHardware(merged, layout, activeSide, pickFromModel(model, materials), materials), layout };
}
