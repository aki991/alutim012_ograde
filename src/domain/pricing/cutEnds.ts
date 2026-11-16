/** da li neki kraj komada nije ravan (90°); `ends` su uglovi sečenja na početku i na kraju ose komada (dva ugla = zasek V) */
export const hasAngledEnds = (e?: [number[], number[]]): boolean => !!e && e.some((a) => a.some((x) => Math.abs(x - 90) > 0.05));

/** ugao za prikaz (npr. 45° ili 28,7°) */
const angTxt = (a: number): string => `${String(Math.round(a * 10) / 10).replace('.', ',')}°`;

/** uglovi oba kraja za prikaz: „45° / 90°“; kraj sa dva reza je zasek „45°+45° (V)“ */
export const endsLabel = (e: [number[], number[]]): string => e.map((a) => (a.length > 1 ? `${a.map(angTxt).join('+')} (V)` : angTxt(a[0] ?? 90))).join(' / ');

/** oblik krajeva komada (vidi TailMember.endShape): tačke (ds, tn) u širinama cevi */
export type EndShape = [[number, number][], [number, number][]];

/** komad rama (45° na oba kraja): trapez, duža ivica gore; ds = 1 širina cevi */
export const MITER_SHAPE: EndShape = [[[0, 0], [1, 1]], [[0, 0], [1, 1]]];

/** položaj komada u šipki: swap = krajevi zamenjeni (okrenut levo–desno), flip = okrenut gore–dole (obe = zaokrenut za 180°) */
export interface PieceView { swap: boolean; flip: boolean }
export const VIEWS: PieceView[] = [{ swap: false, flip: false }, { swap: true, flip: true }, { swap: false, flip: true }, { swap: true, flip: false }];

/**
 * Koso zasečen kraj: za koliko (mm) se ivica sa jedne strane cevi povlači unutra u odnosu na drugu (sa znakom: + kad donja ivica ide ka sredini
 * komada). Ravan rez i zasek V (dva reza) nemaju takav pomak (0): ne dele rez.
 */
export function endOffsets(shape: EndShape | undefined, w: number | undefined): [number, number] {
  if (!shape || !w) return [0, 0];
  const off = (c: [number, number][]): number => (c.length === 2 ? (c[1][0] - c[0][0]) * w : 0);
  return [off(shape[0]), off(shape[1])];
}

/** pomaci krajeva (levi, desni) komada u datom položaju u šipki */
export function viewEnds([oL, oR]: [number, number], v: PieceView): [number, number] {
  const [l, r] = v.swap ? [oR, oL] : [oL, oR];
  return v.flip ? [-l, -r] : [l, r];
}

/** oblik krajeva (levi, desni) komada u datom položaju: za crtanje */
export function viewShape(shape: EndShape, v: PieceView): EndShape {
  const [a, b] = v.swap ? [shape[1], shape[0]] : [shape[0], shape[1]];
  const f = (c: [number, number][]): [number, number][] => (v.flip ? c.map(([ds, tn]) => [ds, 1 - tn] as [number, number]).sort((p, q) => p[1] - q[1]) : c);
  return [f(a), f(b)];
}
