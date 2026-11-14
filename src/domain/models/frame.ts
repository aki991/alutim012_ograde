import { contentBounds, normalizeToContent, type CustomModel, type CustomPart } from './custom';
import { resizeModel } from './resize';
import { materialShape, sectionFace } from './materialShape';
import type { Material } from './types';
import { uid } from '../../utils/id';

/**
 * Ram oko platna: četiri dela izabranog profila, spoljna ivica na granici modela, krajevi pod 45° (duža ivica je spoljna).
 * Model se uvećava za širinu profila sa svake strane, a postojeći delovi se pomeraju za tu meru, pa ram stoji oko postojećeg platna.
 */
/**
 * Okretanje preseka rama koje najbolje prati bočne U profile: poredi se vidljiva širina i dubina preseka sa uspravnim U profilima
 * (da ram stoji u ravni sa njima). Bez U profila ili kad se mere ne poklapaju, ostaje 0°.
 */
export function autoFrameRot(model: CustomModel, material: Material, materials: Material[]): 0 | 90 {
  const shape = materialShape(material);
  if (shape.type !== 'linear') return 0;
  const sides = model.parts.filter((p) => { const sh = materialShape(materials.find((m) => m.id === p.materialId) ?? material); return sh.type === 'linear' && !!sh.u && Math.abs(Math.sin((p.angleDeg * Math.PI) / 180)) > 0.99; });
  if (!sides.length) return 0;
  const ref = sides[0]; const rs = materialShape(materials.find((m) => m.id === ref.materialId) ?? material);
  if (rs.type !== 'linear') return 0;
  const e = sectionFace(rs.section, ref.rot);
  const score = (r: number): number => { const x = sectionFace(shape.section, r); return Math.abs(x.face - e.face) + Math.abs(x.depth - e.depth); };
  return score(90) + 1e-6 < score(0) ? 90 : 0;
}

export function modelWithFrame(model: CustomModel, material: Material | undefined, materials: Material[] = [], rotIn?: number): CustomModel | { error: string } {
  const shape = material ? materialShape(material) : null;
  if (!material || shape?.type !== 'linear') return { error: 'Ram se pravi od profila (cevi, U i sličnih profila).' };
  const rot = rotIn ?? autoFrameRot(model, material, materials);
  const { face, u0 } = sectionFace(shape.section, rot);
  // tačne mere (na hiljaditi deo mm): zaokruživanje na 0,1 mm je pravilo dodir od nekoliko stotih delova između rama i platna
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const f = face;
  // ram ide oko svega što je nacrtano (mere modela proizlaze iz crteža)
  const cb = contentBounds(model, (p) => materialShape(materials.find((m) => m.id === p.materialId) ?? material));
  if (!cb) return { error: 'Prvo nacrtajte platno, pa dodajte ram oko njega.' };
  const { x0, y0, x1, y1 } = cb;
  const sx = f - x0; const sy = f - y0;
  const W = r3(x1 - x0 + 2 * f);
  const H = r3(y1 - y0 + 2 * f);
  const base = { materialId: material.id, rot, z: 0, cut45: true as const };
  const frame: CustomPart[] = [
    { ...base, id: uid('part'), x: 0, y: -u0, lengthMm: W, angleDeg: 0, miter: 'lo' },
    { ...base, id: uid('part'), x: 0, y: H - u0 - face, lengthMm: W, angleDeg: 0, miter: 'hi' },
    { ...base, id: uid('part'), x: u0 + face, y: 0, lengthMm: H, angleDeg: 90, miter: 'hi' },
    { ...base, id: uid('part'), x: W + u0, y: 0, lengthMm: H, angleDeg: 90, miter: 'lo' },
  ];
  return { ...model, widthMm: W, heightMm: H, parts: [...model.parts.map((p) => ({ ...p, x: r3(p.x + sx), y: r3(p.y + sy) })), ...frame] };
}

/** ID-ovi delova rama (poslednja četiri dela posle dodavanja) */
export const frameIds = (m: CustomModel): string[] => m.parts.slice(-4).map((p) => p.id);

/** Delovi koji čine ram (dodati dugmetom „Dodaj ram“): imaju rez 45° i oznaku spoljne ivice. */
export const isFramePart = (p: CustomPart): boolean => Boolean(p.cut45 && p.miter);

/** Model bez rama; mere se posle toga ponovo računaju iz crteža. Vraća isti model ako nema rama. */
export function modelWithoutFrame(model: CustomModel): CustomModel {
  return model.parts.some(isFramePart) ? { ...model, parts: model.parts.filter((p) => !isFramePart(p)) } : model;
}

/** Ram se okreće ceo (sva četiri dela): pravi se ponovo oko platna sa novim okretanjem preseka; greška kad nema rama. */
export function modelWithRotatedFrame(model: CustomModel, rot: number, materials: Material[]): CustomModel | { error: string } {
  const fp = model.parts.find(isFramePart);
  if (!fp) return { error: 'Nema rama.' };
  return modelWithFrame(modelWithoutFrame(model), materials.find((m) => m.id === fp.materialId), materials, rot);
}

/**
 * Nova širina i visina celog crteža (sa ramom). Ram zadržava svoju debljinu: platno unutar njega se razvlači ili sužava,
 * pa se ram ponovo pravi oko njega. Bez rama razvlači se ceo crtež.
 */
export function resizeWithFrame(model: CustomModel, widthMm: number, heightMm: number, materials: Material[]): CustomModel | { error: string } {
  const fp = model.parts.find(isFramePart);
  if (!fp) return resizeModel(model, widthMm, heightMm, materials);
  const mat = materials.find((m) => m.id === fp.materialId);
  const shape = mat ? materialShape(mat) : null;
  if (!mat || shape?.type !== 'linear') return { error: 'Materijal rama nije pronađen.' };
  const face = sectionFace(shape.section, fp.rot).face;
  const iw = widthMm - 2 * face; const ih = heightMm - 2 * face;
  if (iw < 50 || ih < 50) return { error: `Ram je širok ${face} mm sa svake strane: unutra mora da ostane bar 50 mm, pa je najmanja mera ${Math.ceil(100 + 2 * face)} mm.` };
  const shapeOf = (p: CustomPart) => { const m = materials.find((x) => x.id === p.materialId); return m ? materialShape(m) : null; };
  const W = model.widthMm; const H = model.heightMm;
  // komadni delovi na ramu (brava, šarke) idu sa ramom: ostaju na istoj udaljenosti od svoje ivice, a duž rama se razmeštaju srazmerno
  const onFrame = (p: CustomPart) => shapeOf(p)?.type === 'piece' && (p.x < face || p.x > W - face || p.y + 1 < face || p.y + 1 > H - face);
  const along = (c: number, size: number, ns: number): number => (c < face ? c : c > size - face ? ns - (size - c) : face + ((c - face) * (ns - 2 * face)) / Math.max(1, size - 2 * face));
  const carried = model.parts.filter(onFrame);
  const inner = normalizeToContent({ ...modelWithoutFrame(model), parts: modelWithoutFrame(model).parts.filter((p) => !onFrame(p)) }, shapeOf).model;
  const framed = modelWithFrame(resizeModel(inner, Math.round(iw * 10) / 10, Math.round(ih * 10) / 10, materials), mat, materials, fp.rot);
  if ('error' in framed) return framed;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const back = carried.map((p) => ({ ...p, x: r1(along(p.x, W, framed.widthMm)), y: r1(along(p.y + 1, H, framed.heightMm) - 1) }));
  return { ...framed, parts: [...framed.parts, ...back] };
}
