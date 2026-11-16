import { colorHex } from './catalog';
import { materialOwnColor, materialShape, sectionFace, solidsBounds, type MatShape } from './materialShape';
import type { Material } from './types';

/**
 * Ručno nacrtan model ograde ili kapije: delovi iz cenovnika postavljeni na polje zadate širine i visine.
 * Koordinate su u mm, pogled spreda: x udesno, y nagore, (0, 0) je donji levi ugao polja.
 */
export type Lufta = 'sa' | 'bez';

export interface CustomPart {
  id: string;
  materialId: string;
  /** profil: početak ose; komadni deo: sredina donje ivice; ploča: donji levi ugao */
  x: number;
  y: number;
  /** profil: dužina; ploča: širina */
  lengthMm: number;
  /** samo ploča: visina */
  heightMm?: number;
  /** ugao u ravni crteža (0 = vodoravno udesno, 90 = uspravno nagore) */
  angleDeg: number;
  /** okretanje preseka oko ose profila (0 / 90 / 180 / 270) */
  rot: number;
  /** nagib preseka oko ose profila (stepeni, dodaje se okretanju): prečka postavljena koso */
  tiltDeg?: number;
  /** prečka uklopljena u dve bočne U vođice (ID levog i desnog U profila): ne može da izađe van njihovog kanala */
  guides?: [string, string];
  /**
   * Tip ograde sa prečkama pod uglom: „sa luftom“ (razmak 0 … najviše koliko staje, vidi se procep) ili „bez lufta“
   * (procepa nema: razmak 0 … najmanji mogući, negativan kad se nagnute prečke uvlače jedna u drugu). Bez vrednosti: „sa luftom“.
   */
  lufta?: Lufta;
  /** deo rama: oba kraja se seku pod 45° (u krojnoj listi dobija oznaku 45°, dužina je spoljna mera) */
  cut45?: boolean;
  /** deo rama sa uglom 45° na krajevima: koja je ivica spoljna (duža): „lo“ = niža strana preseka u lokalnoj osi, „hi“ = viša; bez vrednosti krajevi se crtaju ravno */
  miter?: 'lo' | 'hi';
  /** deo rama: koji su krajevi pod 45° (početak, kraj ose); bez vrednosti su oba. Slobodan kraj rama (bez susedne strane) je ravan. */
  miterEnds?: [boolean, boolean];
  /** pomeraj po dubini (mm, + ka posmatraču) */
  z: number;
  /** sopstvena boja dela (RAL ključ ili #hex), npr. crn ram a sive prečke; bez vrednosti deo je u boji modela */
  color?: string;
}

export interface CustomModel {
  id: string;
  name: string;
  /** ograda (dvorište), kapija ili ograda za terasu (posebna stranica i crtanje, samo materijali za terase) */
  kind: 'fence' | 'gate' | 'terrace';
  widthMm: number;
  heightMm: number;
  /** RAL ključ boje; materijali sa RAL oznakom ili inox u nazivu zadržavaju svoju boju */
  color: string;
  parts: CustomPart[];
  /** tolerancija (zazor) prečki u kanalu bočnih U profila, mm: otvor za uklapanje se smanjuje za toliko (0 = prečka dodiruje obe stranice) */
  barClearance?: number;
  updatedAt: string;
  /** model nastao doradom modela iz kataloga (ID tog modela) */
  baseModelId?: string;
  /** samo vrsta „Kapija“: podešavanja kapije iz „Mere kapije“ (tip, pogon, mere i okovi), čuvaju se uz crtež */
  gate?: import('../gates/gateModels').GateConfig;
  /** model zamenjuje model iz kataloga („sačuvaj na istom tipu“): u izboru modela stoji umesto njega, a projekti ga koriste */
  replaces?: string;
  /** upozorenja iz provere crteža koja je radnik prihvatio (ključevi); ne prikazuju se kao aktivna */
  acceptedWarnings?: string[];
}

/** koji krajevi dela rama su pod 45° (početak i kraj ose); deo koji nije deo rama nema ugaone krajeve */
export const miterEndsOf = (p: Pick<CustomPart, 'cut45' | 'miter' | 'miterEnds'>): [boolean, boolean] => (p.cut45 && p.miter ? p.miterEnds ?? [true, true] : [false, false]);

export const CUSTOM_KIND_LABELS = { fence: 'Ograda', gate: 'Kapija', terrace: 'Ograda za terasu' } as const;

export const newCustomModel = (id: string): CustomModel => ({ id, name: 'Novi model', kind: 'fence', widthMm: 2000, heightMm: 1500, color: 'RAL 7016', parts: [], updatedAt: new Date().toISOString() });

/** Nov crtež ograde za terasu: visina rukohvata 1100 mm, srebrna (eloksaža). */
export const newTerraceModel = (id: string): CustomModel => ({ ...newCustomModel(id), kind: 'terrace', name: 'Nova ograda za terasu', widthMm: 2000, heightMm: 1100, color: 'RAL 9006' });

/** Ukupan ugao preseka: okretanje + nagib (stepeni). */
export const partAngle = (p: Pick<CustomPart, 'rot' | 'tiltDeg'>): number => p.rot + (p.tiltDeg ?? 0);

/**
 * Boja dela na crtežu (hex): sopstvena boja dela (izabrana u crtanju modela), pa RAL / inox iz naziva materijala, pa boja modela.
 * U projektu je boja modela boja polja, a delovi sa sopstvenom bojom je zadržavaju.
 */
export const partHex = (mat: Material | undefined, model: Pick<CustomModel, 'color'>, part?: Pick<CustomPart, 'color'>): string =>
  (part?.color ? colorHex(part.color) : null) || (mat && materialOwnColor(mat.name)) || colorHex(model.color);

/** Delovi sa sopstvenom bojom dobijaju novu boju (null = boja modela); ostali delovi se ne menjaju. */
export function setPartsColor(model: CustomModel, ids: string[], color: string | null): CustomModel {
  const s = new Set(ids);
  return { ...model, parts: model.parts.map((p) => { if (!s.has(p.id)) return p; const { color: _old, ...rest } = p; return color ? { ...rest, color } : rest; }) };
}

/** Okvir dela u koordinatama crteža (za izbor, uklapanje pogleda i minijaturu). */
export function partBounds(p: CustomPart, shape: MatShape): { x0: number; y0: number; x1: number; y1: number } {
  if (shape.type === 'sheet') return { x0: p.x, y0: p.y, x1: p.x + p.lengthMm, y1: p.y + (p.heightMm ?? 0) };
  const a = (p.angleDeg * Math.PI) / 180;
  const c = Math.cos(a); const s = Math.sin(a);
  let local: [number, number][];
  if (shape.type === 'linear') {
    const { u0, u1 } = sectionFace(shape.section, partAngle(p));
    local = [[0, u0], [p.lengthMm, u0], [p.lengthMm, u1], [0, u1]];
  } else {
    const b = solidsBounds(shape.solids);
    local = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
  }
  const pts = local.map(([lx, ly]) => [p.x + lx * c - ly * s, p.y + lx * s + ly * c]);
  return { x0: Math.min(...pts.map((q) => q[0])), y0: Math.min(...pts.map((q) => q[1])), x1: Math.max(...pts.map((q) => q[0])), y1: Math.max(...pts.map((q) => q[1])) };
}

/**
 * Svi delovi staju u okvir modela (0 … širina, 0 … visina): deo koji viri pomera se nazad unutra, bez promene mere.
 * Npr. bočni U profil 60 × 28 sa osom na x = 10 bi išao od −4; pomera se tako da počne na 0.
 * Deo veći od okvira: sa `grow` okvir raste do mere dela (okvir prati stvarnu ogradu, npr. bočne strane produžene na 1200
 * daju visinu 1200), a bez njega se deo samo poravnava sa početkom okvira. Delovi nepoznatog materijala ostaju gde jesu.
 */
export function clampToFrame(model: CustomModel, shapeOf: (p: CustomPart) => MatShape | null, grow = false): CustomModel {
  const items = model.parts.map((p) => { const s = shapeOf(p); return { p, b: s ? partBounds(p, s) : null }; });
  let W = model.widthMm; let H = model.heightMm;
  if (grow) for (const { b } of items) if (b) { W = Math.max(W, Math.ceil(b.x1 - b.x0 - 1e-6)); H = Math.max(H, Math.ceil(b.y1 - b.y0 - 1e-6)); }
  const shift = (lo: number, hi: number, max: number): number => (hi - lo >= max || lo < 0 ? -lo : hi > max ? max - hi : 0);
  let changed = W !== model.widthMm || H !== model.heightMm;
  const parts = items.map(({ p, b }) => {
    if (!b) return p;
    const dx = shift(b.x0, b.x1, W); const dy = shift(b.y0, b.y1, H);
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return p;
    changed = true;
    const r = (n: number) => Math.round(n * 1000) / 1000;
    return { ...p, x: r(p.x + dx), y: r(p.y + dy) };
  });
  return changed ? { ...model, widthMm: W, heightMm: H, parts } : model;
}

/**
 * Okvir nacrtanog (mm): svi profili i ploče, i komadni delovi koji ne leže na nečemu. Brava ili šarka koja stoji na ramu ili krilu
 * (njena tačka oslonca je unutar nekog profila) ne širi mere crteža, jer je deo tog profila, a ne dodatak sa strane.
 */
export function extentBounds(items: { part: CustomPart; shape: MatShape }[]): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  const solids = items.filter((i) => i.shape.type !== 'piece').map((i) => partBounds(i.part, i.shape));
  const take = (b: { x0: number; y0: number; x1: number; y1: number }) => { x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); };
  for (const b of solids) take(b);
  for (const i of items) {
    if (i.shape.type !== 'piece') continue;
    const ax = i.part.x; const ay = i.part.y + 1;
    const resting = solids.some((b) => ax >= b.x0 - 1e-6 && ax <= b.x1 + 1e-6 && ay >= b.y0 - 1e-6 && ay <= b.y1 + 1e-6);
    if (!resting) take(partBounds(i.part, i.shape));
  }
  return x1 >= x0 ? { x0, y0, x1, y1 } : null;
}

/**
 * Opseg nacrtanog po dubini (Z, napred–nazad): profili zauzimaju z + presek (v0 … v1), ploče z ± debljina / 2. Komadni delovi se ne računaju.
 * Sredina opsega je ravan krila: klizni okov (C-profil, rep, vođica) se postavlja u nju, da stoji tačno iza/ispred platna.
 */
export function zExtent(items: { part: CustomPart; shape: MatShape }[]): { z0: number; z1: number; mid: number; depth: number } | null {
  let z0 = Infinity; let z1 = -Infinity;
  for (const { part, shape } of items) {
    if (shape.type === 'sheet') { z0 = Math.min(z0, part.z - shape.thick / 2); z1 = Math.max(z1, part.z + shape.thick / 2); continue; }
    if (shape.type !== 'linear') continue;
    const e = sectionFace(shape.section, partAngle(part));
    z0 = Math.min(z0, part.z + e.v0); z1 = Math.max(z1, part.z + e.v1);
  }
  return z1 >= z0 ? { z0, z1, mid: (z0 + z1) / 2, depth: z1 - z0 } : null;
}

/**
 * Opseg po dubini (Z) samo onih delova koji dopiru do gornje ivice krila (gornja prečka rama, krajevi bočnih profila): tu stoje valjci
 * gornje vođice, pa moraju da leže na stvarnu debljinu gornjeg dela, a ne na najdublji profil krila. Bez takvih delova: ceo opseg.
 */
export function zExtentTop(items: { part: CustomPart; shape: MatShape }[], heightMm: number): { z0: number; z1: number; mid: number; depth: number } | null {
  const top = items.filter(({ part, shape }) => shape.type !== 'piece' && partBounds(part, shape).y1 >= heightMm - 1);
  return zExtent(top.length ? top : items);
}

/** Okvir svih nacrtanih delova (vidi extentBounds); null kad nema delova. */
export function contentBounds(model: Pick<CustomModel, 'parts'>, shapeOf: (p: CustomPart) => MatShape | null): { x0: number; y0: number; x1: number; y1: number } | null {
  const items: { part: CustomPart; shape: MatShape }[] = [];
  for (const p of model.parts) { const shape = shapeOf(p); if (shape) items.push({ part: p, shape }); }
  return extentBounds(items);
}

/**
 * Mere modela proizlaze iz crteža: širina i visina su mere svega što je nacrtano, a delovi se pomeraju tako da donji levi ugao
 * crteža bude (0, 0). Vraća pomeraj (dx, dy) koji je primenjen na delove (0, 0 kad se ništa nije pomerilo).
 */
export function normalizeToContent(model: CustomModel, shapeOf: (p: CustomPart) => MatShape | null): { model: CustomModel; dx: number; dy: number } {
  const b = contentBounds(model, shapeOf);
  if (!b) return { model, dx: 0, dy: 0 };
  const r = (n: number) => Math.round(n * 1000) / 1000;
  const dx = Math.abs(b.x0) < 1e-6 ? 0 : -b.x0; const dy = Math.abs(b.y0) < 1e-6 ? 0 : -b.y0;
  const W = Math.round((b.x1 - b.x0) * 10) / 10; const H = Math.round((b.y1 - b.y0) * 10) / 10;
  if (dx === 0 && dy === 0 && W === model.widthMm && H === model.heightMm) return { model, dx: 0, dy: 0 };
  const parts = dx === 0 && dy === 0 ? model.parts : model.parts.map((p) => ({ ...p, x: r(p.x + dx), y: r(p.y + dy) }));
  return { model: { ...model, widthMm: W, heightMm: H, parts }, dx, dy };
}

export interface ResolvedPart { part: CustomPart; shape: MatShape; hex: string; material: Material | undefined }

/**
 * Delovi modela sa oblikom i bojom; deo čiji je materijal obrisan iz cenovnika crta se kao sivi profil 40 × 20.
 * Bočne U vođice se crtaju posle prečki, da krajevi prečki u kanalu budu iza stranice U profila (kao u stvarnosti).
 */
export function resolveParts(model: Pick<CustomModel, 'parts' | 'color'>, materials: Material[]): ResolvedPart[] {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const guideIds = new Set(model.parts.flatMap((p) => p.guides ?? []));
  const ordered = guideIds.size ? [...model.parts.filter((p) => !guideIds.has(p.id)), ...model.parts.filter((p) => guideIds.has(p.id))] : model.parts;
  const all = ordered.map((part) => {
    const material = byId.get(part.materialId);
    const shape = material ? materialShape(material) : materialShape({ sku: '', name: part.heightMm ? 'ploča' : 'profil 40x20', unit: part.heightMm ? 'm2' : 'm', category: 'ostalo' });
    return { part, shape, hex: material ? partHex(material, model, part) : part.color ? colorHex(part.color) : '#94a3b8', material };
  });
  // komadni delovi (brave, šarke, kape) se crtaju na kraju: uvek su iznad profila i mogu da stoje bilo gde, i na ramu
  return [...all.filter((r) => r.shape.type !== 'piece'), ...all.filter((r) => r.shape.type === 'piece')];
}

/**
 * Model razvučen na polje druge veličine: položaji delova i dužine profila prate širinu i visinu polja,
 * a preseci profila i komadni delovi zadržavaju stvarne mere. Broj delova ostaje isti.
 */
export function scaleModel(model: CustomModel, widthMm: number, heightMm: number): CustomModel {
  const sx = widthMm / model.widthMm; const sy = heightMm / model.heightMm;
  if (Math.abs(sx - 1) < 1e-9 && Math.abs(sy - 1) < 1e-9) return model;
  return {
    ...model, widthMm, heightMm,
    parts: model.parts.map((p) => {
      if (p.heightMm) return { ...p, x: p.x * sx, y: p.y * sy, lengthMm: p.lengthMm * sx, heightMm: p.heightMm * sy };
      const a = (p.angleDeg * Math.PI) / 180;
      const cx = Math.cos(a) * sx; const cy = Math.sin(a) * sy;
      const ortho = p.angleDeg % 90 === 0;
      return { ...p, x: p.x * sx, y: p.y * sy, lengthMm: p.lengthMm * Math.hypot(cx, cy), angleDeg: ortho ? p.angleDeg : (Math.atan2(cy, cx) * 180) / Math.PI };
    }),
  };
}

export interface CustomBomLine { materialId: string; sku: string; name: string; unit: string; count: number; qty: number; qtyLabel: string; unitPrice: number; total: number; missing: boolean }

const nf = (n: number, d = 2): string => n.toLocaleString('sr-Latn-RS', { maximumFractionDigits: d });

/** Spisak materijala nacrtanog modela: profili po dužini, ploče po površini, komadni delovi po broju (bez otpada). */
export function customBom(model: CustomModel, materials: Material[]): CustomBomLine[] {
  const acc = new Map<string, { count: number; mm: number; mm2: number }>();
  for (const p of model.parts) {
    const a = acc.get(p.materialId) ?? { count: 0, mm: 0, mm2: 0 };
    a.count += 1; a.mm += p.lengthMm; a.mm2 += p.lengthMm * (p.heightMm ?? 0);
    acc.set(p.materialId, a);
  }
  return [...acc.entries()].map(([materialId, a]) => {
    const mat = materials.find((m) => m.id === materialId);
    const shape = mat ? materialShape(mat) : null;
    const unit = mat?.unit ?? 'kom';
    let qty = a.count; let qtyLabel = `${a.count} kom`;
    if (shape?.type === 'linear') {
      qtyLabel = `${a.count} kom, ${nf(a.mm / 1000)} m`;
      if (unit === 'm') qty = a.mm / 1000;
    } else if (shape?.type === 'sheet') {
      qtyLabel = `${a.count} kom, ${nf(a.mm2 / 1e6)} m²`;
      if (unit === 'm2') qty = a.mm2 / 1e6;
    }
    const unitPrice = mat?.unitPrice ?? 0;
    return { materialId, sku: mat?.sku ?? '—', name: mat?.name ?? 'Materijal je obrisan iz cenovnika', unit, count: a.count, qty, qtyLabel, unitPrice, total: qty * unitPrice, missing: !mat || unitPrice <= 0 };
  });
}

/** Kopije dela pomerene za korak (mm) upravno na osu profila (za ploče i komadne delove: udesno). */
export function repeatPart(p: CustomPart, shape: MatShape, count: number, stepMm: number, newId: () => string): CustomPart[] {
  const a = (p.angleDeg * Math.PI) / 180;
  // vodoravan profil se ponavlja nagore, uspravan udesno
  const [dx, dy] = shape.type === 'linear' ? (Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? [0, 1] : [1, 0]) : [1, 0];
  return Array.from({ length: count }, (_, i) => ({ ...p, id: newId(), x: p.x + dx * stepMm * (i + 1), y: p.y + dy * stepMm * (i + 1) }));
}
