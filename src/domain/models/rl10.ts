import type { FenceModelId, FenceParams, LayoutItem } from './types';

/**
 * Model „Inox — horizontalne prečke" po sistemu BTS ROUND RL10 (Horizontal Safety Line Railing), katalog str. 22–23:
 *  - rukohvat P-1033 (cev Ø50 × 2 mm) na vrhu, završeci AK-5009, zidna prirubnica AK-5037, koleno AK-5020S;
 *  - stub P-1054 (Ø40 × 2 mm sa kanalom) sa pokrivnom lajsnom P-AL2647 u kanalu;
 *  - veza stuba i rukohvata AK-5039N (sabit uzun mafsal Ø40 → Ø50), ispod nje prsten AK-5062 na vrhu stuba;
 *  - stopa stuba AK-5036X (spoljna prirubnica sa čaurom), sidrenje AK-5027K (hemijsko sidro, 3 po stopi);
 *  - prečke P-1146 (cev Ø16) u nosačima AK-5011Y ispred stuba, završeci prečki AK-5012A, ugaono koleno prečke AK-5022A.
 * Mere delova su PLANERSKE (procena iz kataloga) i mogu se menjati u projektu; šifre su iz kataloga BTS.
 */
export const RL10_MODEL: FenceModelId = 'rail_inox';
export const isRl10Model = (id: FenceModelId | undefined): boolean => id === RL10_MODEL;

export interface Rl10Dims {
  /** prečnik rukohvata P-1033 */
  railDiaMm: number;
  /** prečnik stuba P-1054 */
  postDiaMm: number;
  /** visina veze AK-5039N: od vrha stuba do donje ivice rukohvata */
  saddleMm: number;
  /** prsten AK-5062 na vrhu stuba: prečnik i visina */
  ringDiaMm: number;
  ringMm: number;
  /** stopa AK-5036X: prečnik i debljina ploče, prečnik i visina čaure oko stuba */
  flangeDiaMm: number;
  flangeMm: number;
  sleeveDiaMm: number;
  sleeveMm: number;
  /** nosač prečke AK-5011Y: prečnik tela i razmak ose prečke od ose stuba (prečke su ispred stuba) */
  holderDiaMm: number;
  rodOffsetMm: number;
  /** osa najniže prečke iznad poda i osa najviše prečke ispod donje ivice rukohvata */
  rodBottomMm: number;
  rodTopMm: number;
  /** prepust rukohvata i prečki preko ose krajnjeg stuba (do završetka AK-5009 / AK-5012A) */
  railOverhangMm: number;
  rodOverhangMm: number;
  /** zglob rukohvata AK-5020K (kugla Ø50, spoj ravnog dela i stepeništa) i zglob prečke AK-5022Y: dužina tela mereno duž cevi */
  railJointMm: number;
  rodJointMm: number;
  /** stub uz zglob stoji samostalno: pomeren od zgloba ka ravnom delu za toliko (zglob rukohvata i prečki ne nosi stub) */
  jointPostOffsetMm: number;
  /** ugao u osnovi (stepenište pa ograda u stranu): pravo parče rukohvata između dve kugle AK-5020K (osa–osa kugli) */
  cornerPieceMm: number;
}

export const RL10_DEFAULTS: Rl10Dims = {
  railDiaMm: 50,
  postDiaMm: 40,
  saddleMm: 60,
  ringDiaMm: 46,
  ringMm: 8,
  flangeDiaMm: 100,
  flangeMm: 8,
  sleeveDiaMm: 50,
  sleeveMm: 70,
  holderDiaMm: 30,
  rodOffsetMm: 38,
  rodBottomMm: 120,
  rodTopMm: 140,
  railOverhangMm: 60,
  rodOverhangMm: 40,
  railJointMm: 64,
  rodJointMm: 36,
  jointPostOffsetMm: 125,
  cornerPieceMm: 170,
};

/** Opseg dozvoljenih vrednosti mera (mm) za polja u panelu. */
export const RL10_LIMITS: Record<keyof Rl10Dims, { min: number; max: number }> = {
  railDiaMm: { min: 30, max: 80 },
  postDiaMm: { min: 25, max: 80 },
  saddleMm: { min: 20, max: 150 },
  ringDiaMm: { min: 25, max: 100 },
  ringMm: { min: 0, max: 40 },
  flangeDiaMm: { min: 50, max: 200 },
  flangeMm: { min: 3, max: 30 },
  sleeveDiaMm: { min: 25, max: 120 },
  sleeveMm: { min: 0, max: 200 },
  holderDiaMm: { min: 10, max: 60 },
  rodOffsetMm: { min: 0, max: 120 },
  rodBottomMm: { min: 30, max: 600 },
  rodTopMm: { min: 30, max: 600 },
  railOverhangMm: { min: 0, max: 300 },
  rodOverhangMm: { min: 0, max: 300 },
  railJointMm: { min: 20, max: 150 },
  rodJointMm: { min: 10, max: 100 },
  jointPostOffsetMm: { min: 50, max: 300 },
  cornerPieceMm: { min: 100, max: 500 },
};

export const RL10_LABELS: Record<keyof Rl10Dims, string> = {
  railDiaMm: 'Prečnik rukohvata (P-1033)',
  postDiaMm: 'Prečnik stuba (P-1054)',
  saddleMm: 'Visina veze stub–rukohvat (AK-5039N)',
  ringDiaMm: 'Prečnik prstena na vrhu stuba (AK-5062)',
  ringMm: 'Visina prstena (AK-5062)',
  flangeDiaMm: 'Prečnik stope (AK-5036X)',
  flangeMm: 'Debljina ploče stope',
  sleeveDiaMm: 'Prečnik čaure stope',
  sleeveMm: 'Visina čaure stope',
  holderDiaMm: 'Prečnik nosača prečke (AK-5011Y)',
  rodOffsetMm: 'Osa prečke od ose stuba',
  rodBottomMm: 'Najniža prečka od poda (osa)',
  rodTopMm: 'Najviša prečka ispod rukohvata (osa)',
  railOverhangMm: 'Prepust rukohvata na kraju',
  rodOverhangMm: 'Prepust prečki na kraju',
  railJointMm: 'Dužina zgloba rukohvata (AK-5020K)',
  rodJointMm: 'Dužina zgloba prečke (AK-5022Y)',
  jointPostOffsetMm: 'Pomeraj stuba od zgloba (ka ravnom delu)',
  cornerPieceMm: 'Pravo parče rukohvata na uglu (osa–osa kugli)',
};

/** Prečke: prečnik je „debljina prečke" polja, a broj prečki je zajednički broj prečki ograde. */
export const RL10_ROD_DEFAULT = { diaMm: 16, count: 4, min: 1, max: 10 } as const;

export const rl10Dims = (params: Pick<FenceParams, 'rl10'> | undefined): Rl10Dims => ({ ...RL10_DEFAULTS, ...(params?.rl10 ?? {}) });

export interface Rl10Geometry {
  dims: Rl10Dims;
  rodDiaMm: number;
  /** visine osa prečki od poda (odozdo naviše) */
  rodHeightsMm: number[];
  /** osa rukohvata od poda i vrh stuba (pod vezom AK-5039N) od poda */
  railAxisMm: number;
  postTopMm: number;
}

/** Visine delova polja visine `heightMm` (do vrha rukohvata): rukohvat, vrh stuba i ose prečki ravnomerno raspoređene. */
export function rl10Geometry(heightMm: number, params: FenceParams): Rl10Geometry {
  const d = rl10Dims(params);
  const rodDiaMm = params.barSizeMm > 0 ? params.barSizeMm : RL10_ROD_DEFAULT.diaMm;
  const n = Math.max(RL10_ROD_DEFAULT.min, Math.min(RL10_ROD_DEFAULT.max, Math.round(params.barCount ?? RL10_ROD_DEFAULT.count)));
  const railAxisMm = heightMm - d.railDiaMm / 2;
  const postTopMm = Math.max(d.sleeveMm + 50, heightMm - d.railDiaMm - d.saddleMm);
  const lo = Math.min(d.rodBottomMm, postTopMm - 20);
  const hi = Math.max(lo, heightMm - d.railDiaMm - d.rodTopMm);
  const rodHeightsMm = n === 1 ? [Math.round((lo + hi) / 2)] : Array.from({ length: n }, (_, k) => Math.round(lo + ((hi - lo) * k) / (n - 1)));
  return { dims: d, rodDiaMm, rodHeightsMm, railAxisMm, postTopMm };
}

type ModelItem = Pick<LayoutItem, 'kind'> & { modelId?: FenceModelId };

/** Stub uz bar jedno polje modela RL10 (crta se kao stub RL10: stopa, cev sa lajsnom, prsten, veza sa rukohvatom, nosači prečki). */
export function isRl10Post(items: ReadonlyArray<ModelItem>, index: number): boolean {
  return [items[index - 1], items[index]].some((it) => it?.kind === 'fence' && it.modelId === RL10_MODEL);
}

/** Polje RL10 uz stub: levo, ako nema onda desno (mere i prečke stuba se uzimaju od njega). */
export function rl10ItemAt<T extends ModelItem>(items: ReadonlyArray<T>, postIndex: number): T | undefined {
  return [items[postIndex - 1], items[postIndex]].find((it) => it?.kind === 'fence' && it.modelId === RL10_MODEL);
}

/** Krajnji stub niza RL10: samo s jedne strane je polje RL10 (tu su završeci rukohvata i prečki). */
export function isRl10EndPost(items: ReadonlyArray<ModelItem>, index: number): { left: boolean; right: boolean } {
  const isR = (it: ModelItem | undefined) => it?.kind === 'fence' && it.modelId === RL10_MODEL;
  return { left: isR(items[index]) && !isR(items[index - 1]), right: isR(items[index - 1]) && !isR(items[index]) };
}

/** Šta rukohvat radi iznad stuba: nagib sa leve i desne strane (tangens; 0 = ravno). */
export interface Rl10PostInfo {
  /** nagib rukohvata iznad stuba (rad) kad je isti sa obe strane ili postoji samo jedna strana; 0 = ravan */
  tilt: number;
  /** spoj ravnog dela i stepeništa: zglob rukohvata AK-5020K i zglobovi prečki AK-5022Y; nagibi (tangens) levo i desno */
  joint: { left: number; right: number } | null;
  /** veza stub–rukohvat: fiksna AK-5039N (ravno, ispod zgloba) ili podesiva AK-5001 (pod nagibom) */
  adjustable: boolean;
}

interface LayoutLike { items: { axisStart: number; axisEnd: number; floorStart: number; floorEnd: number }[] }

/** Nagib polja RL10 (tangens) iz rasporeda. */
export const rl10Tan = (li: LayoutLike['items'][number] | undefined): number => (li && li.axisEnd > li.axisStart ? (li.floorEnd - li.floorStart) / (li.axisEnd - li.axisStart) : 0);

export function rl10PostInfo(items: ReadonlyArray<ModelItem>, layout: LayoutLike, index: number): Rl10PostInfo {
  const isR = (it: ModelItem | undefined) => it?.kind === 'fence' && it.modelId === RL10_MODEL;
  const l = isR(items[index - 1]) ? rl10Tan(layout.items[index - 1]) : null;
  const r = isR(items[index]) ? rl10Tan(layout.items[index]) : null;
  if (l !== null && r !== null) {
    // spoj: zglob stoji sam, a stub je pomeren ka ravnijem delu i nosi samo njega (ležište prati nagib te strane)
    if (Math.abs(l - r) > 1e-3) { const t = Math.abs(l) <= Math.abs(r) ? l : r; return { tilt: Math.atan(t), joint: { left: l, right: r }, adjustable: Math.abs(t) > 1e-3 }; }
    return { tilt: Math.atan(l), joint: null, adjustable: Math.abs(l) > 1e-3 };
  }
  const t = l ?? r ?? 0;
  return { tilt: Math.atan(t), joint: null, adjustable: Math.abs(t) > 1e-3 };
}

export type PostTurns = ReadonlyArray<{ turnDeg?: number } | undefined>;

/** Ugao skretanja (rad) na stubu `index`; krajnji stubovi nemaju skretanje. */
const turnRadAt = (items: ReadonlyArray<ModelItem>, posts: PostTurns | undefined, index: number): number => {
  if (!posts || index <= 0 || index >= items.length) return 0;
  const t = posts[index]?.turnDeg;
  return Number.isFinite(t) ? (Math.max(-175, Math.min(175, t as number)) * Math.PI) / 180 : 0;
};

/**
 * Ugao u osnovi između dva polja RL10 (stepenište pa ograda u stranu, ili ravno pa u stranu). Stepenište koje se završava
 * ravnim delom ima pravo parče rukohvata između dve kugle AK-5020K: prva kugla menja nagib, druga skreće u stranu. Prečke se
 * spajaju isto, kuglama AK-5022Y: prva menja nagib, pa pravo parče prečke, pa druga kugla koja skreće u stranu. Skretanje bez
 * promene nagiba ima po jednu kuglu na rukohvatu i na svakoj prečki.
 */
export interface Rl10Corner {
  /** ugao skretanja (rad): + ka +z */
  turn: number;
  /** pravo parče rukohvata (mm, osa–osa kugli) — 0 ako je jedna kugla */
  pieceMm: number;
  /** postoji prva kugla koja menja nagib (stepenište pa ravan deo) */
  slopeBall: boolean;
  /** zglob rukohvata: dužina pravog parčeta između kugli (bez polovina kugli) */
  railPieceLenMm: number;
  rod: {
    /** ofset ose prečke od ose rukohvata i tačka preseka osa prečki na uglu (x od prve kugle, u pravcu dolazeće ograde) */
    offsetMm: number;
    cornerX: number;
    /** gde se završava prečka pred kuglom na uglu (x od prve kugle) */
    inEndX: number;
    /** gde počinje prečka posle kugle na uglu (mereno od druge kugle rukohvata duž nove ograde) */
    outStartMm: number;
    /** pravo parče prečke između kugle za nagib i kugle na uglu (samo uz stepenište) */
    pieceLenMm: number;
  };
}

export function rl10Corner(items: ReadonlyArray<ModelItem & { params?: FenceParams }>, layout: LayoutLike, posts: PostTurns | undefined, index: number): Rl10Corner | null {
  const isR = (it: ModelItem | undefined) => it?.kind === 'fence' && it.modelId === RL10_MODEL;
  if (!isR(items[index - 1]) || !isR(items[index])) return null;
  const turn = turnRadAt(items, posts, index);
  if (Math.abs(turn) < 1e-6) return null;
  const l = rl10Tan(layout.items[index - 1]);
  const r = rl10Tan(layout.items[index]);
  const d = rl10Dims((items[index - 1] as { params?: FenceParams }).params);
  // stepenište pa ravan deo: dve kugle sa pravim parčetom; ostalo (jedna kugla na uglu)
  const slopeBall = Math.abs(l) > Math.abs(r) + 1e-3;
  const pieceMm = slopeBall ? d.cornerPieceMm : 0;
  const e = d.rodOffsetMm;
  const th = Math.tan(turn / 2);
  // prečke su pomerene od ose rukohvata za e: njihov ugao je u preseku pomerenih linija
  const cornerX = pieceMm + e * (th * Math.cos(turn) - Math.sin(turn));
  const half = d.rodJointMm / 2;
  return {
    turn, pieceMm, slopeBall,
    railPieceLenMm: slopeBall ? Math.max(10, pieceMm - d.railJointMm) : 0,
    rod: { offsetMm: e, cornerX, inEndX: cornerX - half, outStartMm: e * th + half, pieceLenMm: slopeBall ? Math.max(8, cornerX - d.rodJointMm) : 0 },
  };
}

/** Kraj prečke ili rukohvata polja: slobodan (prepust i završetak), zglob/kugla ili nastavak. `insetMm` je skraćenje duž cevi (− = prepust). */
export interface Rl10End { kind: 'cap' | 'joint' | 'through'; insetMm: number }
export interface Rl10FieldEnds { left: { rail: Rl10End; rod: Rl10End }; right: { rail: Rl10End; rod: Rl10End } }

export function rl10Ends(items: ReadonlyArray<ModelItem & { params?: FenceParams }>, layout: LayoutLike, itemIndex: number, posts?: PostTurns): Rl10FieldEnds {
  const isR = (it: ModelItem | undefined) => it?.kind === 'fence' && it.modelId === RL10_MODEL;
  const me = rl10Tan(layout.items[itemIndex]);
  const d = rl10Dims((items[itemIndex] as { params?: FenceParams }).params);
  const cap = (over: number): Rl10End => ({ kind: 'cap', insetMm: -over });
  const side = (postIndex: number, neighbour: number): { rail: Rl10End; rod: Rl10End } => {
    if (!isR(items[neighbour])) return { rail: cap(d.railOverhangMm), rod: cap(d.rodOverhangMm) };
    const corner = rl10Corner(items, layout, posts, postIndex);
    const isLeftEnd = neighbour < itemIndex; // ovo polje je desno od stuba
    if (corner) {
      if (corner.slopeBall) {
        // stepenište (levo) pa ravan deo (desno): stepenište se završava prvom kuglom; ravan deo počinje drugom kuglom
        if (isLeftEnd) return { rail: { kind: 'joint', insetMm: d.railJointMm / 2 }, rod: { kind: 'joint', insetMm: corner.rod.outStartMm } };
        return { rail: { kind: 'joint', insetMm: d.railJointMm / 2 }, rod: { kind: 'joint', insetMm: d.rodJointMm / 2 } };
      }
      const rodIn = -corner.rod.inEndX; // skraćenje prečke pred kuglom na uglu (levo polje, desni kraj)
      return isLeftEnd
        ? { rail: { kind: 'joint', insetMm: d.railJointMm / 2 }, rod: { kind: 'joint', insetMm: corner.rod.outStartMm } }
        : { rail: { kind: 'joint', insetMm: d.railJointMm / 2 }, rod: { kind: 'joint', insetMm: rodIn } };
    }
    const sameSlope = Math.abs(rl10Tan(layout.items[neighbour]) - me) <= 1e-3;
    return sameSlope ? { rail: { kind: 'through', insetMm: 0 }, rod: { kind: 'through', insetMm: 0 } } : { rail: { kind: 'joint', insetMm: d.railJointMm / 2 }, rod: { kind: 'joint', insetMm: d.rodJointMm / 2 } };
  };
  return { left: side(itemIndex, itemIndex - 1), right: side(itemIndex + 1, itemIndex + 1) };
}

/**
 * Pomeraj stuba uz zglob (mm duž ograde, + udesno): stub ne nosi zglob rukohvata i prečki, nego stoji `jointPostOffsetMm` od njega,
 * na strani ravnijeg dela. 0 ako uz stub nema zgloba.
 */
export function rl10JointShift(items: ReadonlyArray<ModelItem & { params?: FenceParams }>, layout: LayoutLike, index: number, posts?: PostTurns): number {
  // ugao u osnovi: stub se pomera na novu ogradu (125 mm od ugla), a pomoćni stub je isto toliko na dolazećoj ogradi
  if (rl10Corner(items, layout, posts, index)) return rl10Dims((items[index - 1] as { params?: FenceParams }).params).jointPostOffsetMm;
  const info = rl10PostInfo(items, layout, index);
  if (!info.joint) return 0;
  const it = (items[index - 1] as { params?: FenceParams } | undefined) ?? (items[index] as { params?: FenceParams } | undefined);
  const off = rl10Dims(it?.params).jointPostOffsetMm;
  return Math.abs(info.joint.left) <= Math.abs(info.joint.right) ? -off : off;
}

/**
 * Ugao u osnovi ima dva stuba: stub projekta je na novoj ogradi, `jointPostOffsetMm` od ugla, a pomoćni stub je isto toliko od
 * ugla na dolazećoj ogradi (negativan pomeraj). Ograda se ne lomi na stubu nego na kraju ograde, gde se spajaju kuglice.
 * Vraća pomeraj pomoćnog stuba (mm duž dolazeće ograde, − ulevo od ugla) ili null ako uz stub nema ugla.
 */
export function rl10AuxPostShift(items: ReadonlyArray<ModelItem & { params?: FenceParams }>, layout: LayoutLike, index: number, posts?: PostTurns): number | null {
  if (!rl10Corner(items, layout, posts, index)) return null;
  return -rl10Dims((items[index - 1] as { params?: FenceParams }).params).jointPostOffsetMm;
}
