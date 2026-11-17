/**
 * Provera dokumenata za proizvodnju (krojna lista, radni nalog, skica) za svaki model ograde: projekat sa tri platna, pešačkom,
 * jednokrilnom i dvokrilnom kapijom, kliznom kapijom po šini i samostojećom (samonosećom) kliznom kapijom, napravljen istim
 * koracima kao u editoru (newItemFor, setOuterWidth, sklop klizne kapije). Ništa se ne upisuje u bazu: projekat postoji samo u memoriji.
 *
 * Koristi se iz testa (modeli iz kataloga) i iz pretraživača (stvarni modeli korisnika, preko `import()` u dev serveru).
 */
import { gateClearWidth, gateFieldsFromModel, withModelPosts } from '../../domain/gates/gateModels';
import { specFromPreset, resolveSliding, slidingBom, type SlidingPresetId } from '../../domain/gates/slidingAssembly';
import { leafHeightOf, slidingH } from '../../domain/gates/slidingLayout';
import { gateLeafPoses, gateSpecWidth } from '../../domain/geometry/gates';
import { computeLayout, outerWidthMm, postHalfSum } from '../../domain/geometry/layout';
import { newItemFor, type NewItemSpec } from '../../domain/geometry/newItem';
import { indexOfItem, insertItem, setOuterWidth, updateItem } from '../../domain/geometry/operations';
import { FENCE_MODELS, isTerraceModel } from '../../domain/models/catalog';
import { allFenceModels, customModelOf, registerCustomModels, setHiddenModels } from '../../domain/models/customRegistry';
import type { CustomModel } from '../../domain/models/custom';
import { createFence, createProject, DEFAULT_FENCE_WIDTH_MM } from '../../domain/models/factories';
import { buildSketch } from '../../domain/models/sketch';
import { evaluateItemSpec, materialName, specFor, type ModelSpecs, type SpecContext } from '../../domain/models/spec';
import type { FenceModelId, Gate, Material, Project } from '../../domain/models/types';
import { buildCuttingList, type CutOptions } from '../../domain/pricing/cutting';
import { buildCutList } from '../../domain/pricing/production';
import { buildWorkOrder } from '../../domain/pricing/workorder';
import { elementModel } from '../../services/pdfSketch';

export type Severity = 'greška' | 'upozorenje';
export interface Finding { model: string; modelName: string; element: string; check: string; severity: Severity; detail: string }

/** elementi probnog projekta: tri platna i pet kapija */
export const AUDIT_ELEMENTS = ['Platno 1', 'Platno 2', 'Platno 3', 'Pešačka kapija', 'Jednokrilna kapija', 'Dvokrilna kapija', 'Klizna kapija (šina)', 'Samostojeća klizna kapija'] as const;

/** Probni projekat za model: isti koraci kao u editoru (novi projekat sa modelom, pa dodavanje elemenata iz kataloga). */
export function buildAuditProject(modelId: FenceModelId, gateType?: CustomModel): Project {
  let p = createProject('Provera', [createFence({ modelId })]);
  if (!isTerraceModel(modelId)) p = setOuterWidth(p, p.items[0].id, DEFAULT_FENCE_WIDTH_MM + 2 * postHalfSum(p, 0));
  let selected: string | null = p.items[0].id;
  const add = (spec: NewItemSpec): string => {
    const { item, outerWidthMm: outer, clearWidthMm } = newItemFor(p, spec, modelId, selected);
    let q = insertItem(p, item, p.items.length);
    q = setOuterWidth(q, item.id, outer);
    if (clearWidthMm) {
      const li = computeLayout(q).items[indexOfItem(q, item.id)];
      if (li) q = setOuterWidth(q, item.id, outer + (clearWidthMm - li.clearWidth));
    }
    p = q; selected = item.id;
    return item.id;
  };
  const addSliding = (preset: SlidingPresetId) => {
    const d = specFromPreset(preset);
    const id = add({ kind: 'gate', gateType: 'sliding' });
    const spec = { ...d.spec, drawnLeaf: true, heightTotal: true };
    let q = updateItem(p, id, { sliding: spec, heightMm: d.frameHeight + d.spec.frameBottomY, opening: 'right', automation: spec.actuation === 'motor', automationType: 'sliding_motor' } as Partial<Gate>);
    q = setOuterWidth(q, id, d.frameWidth + 2 * postHalfSum(q, indexOfItem(q, id)));
    p = q;
  };
  add({ kind: 'fence', modelId });
  add({ kind: 'fence', modelId });
  if (isTerraceModel(modelId)) return p; // ograde za terase nemaju kapije
  if (gateType) {
    // moj tip kapije (nacrtana kapija za ovu ogradu): kao „Dodaj“ uz izabran tip u katalogu editora
    const id = add({ kind: 'gate', gateType: gateType.gate?.gateType ?? 'pedestrian', modelId: gateType.id as FenceModelId });
    const fields = gateFieldsFromModel(gateType);
    const q = updateItem(p, id, { ...fields, infillModelId: gateType.id as FenceModelId } as Partial<Gate>);
    p = withModelPosts(setOuterWidth(q, id, gateClearWidth(gateType) + 2 * postHalfSum(q, indexOfItem(q, id))), id, gateType.gate);
    return p;
  }
  add({ kind: 'gate', gateType: 'pedestrian', modelId });
  add({ kind: 'gate', gateType: 'single', modelId });
  add({ kind: 'gate', gateType: 'double', modelId });
  addSliding('klizna_sina_rucna');
  addSliding('samonoseca_rucna');
  return p;
}

const near = (a: number, b: number, tol = 1.01) => Math.abs(a - b) <= tol;
const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** Provera jednog modela; vraća nalaze (prazno = sve se slaže). */
export function auditModel(modelId: FenceModelId, materials: Material[], specs: ModelSpecs | undefined, opts: CutOptions, gateType?: CustomModel): Finding[] {
  const out: Finding[] = [];
  const modelName = (FENCE_MODELS[modelId]?.name ?? modelId) + (gateType ? ` + tip kapije „${gateType.name}“` : '');
  const push = (element: string, check: string, detail: string, severity: Severity = 'greška') => out.push({ model: modelId, modelName, element, check, severity, detail });
  let p: Project;
  try { p = buildAuditProject(modelId, gateType); } catch (e) { push('—', 'pravljenje projekta', (e as Error).message); return out; }
  const layout = computeLayout(p);
  const label = (idx: number) => {
    const real = p.items.slice(0, idx + 1).filter((x) => !(x.kind === 'opening' && x.spacer)).length - 1;
    return gateType && real === 3 ? `Tip kapije „${gateType.name}“` : AUDIT_ELEMENTS[real] ?? `element ${idx + 1}`;
  };

  let rows: ReturnType<typeof buildCutList>; let cl: ReturnType<typeof buildCuttingList>; let wo: ReturnType<typeof buildWorkOrder>;
  try {
    rows = buildCutList(p, specs, materials);
    cl = buildCuttingList(p, specs, materials, opts);
    wo = buildWorkOrder(p, specs, materials, opts);
  } catch (e) { push('—', 'dokumenti', `pravljenje krojne liste / radnog naloga ne uspeva: ${(e as Error).message}`); return out; }

  /* ---------- 1. krojna lista: šipke ---------- */
  for (const prof of cl.profiles) {
    if (/nije definisano|undefined|NaN/.test(prof.profile)) push('—', 'krojna lista: naziv profila', `profil „${prof.profile}“`, 'upozorenje');
    const placed = prof.bars.reduce((n, b) => n + b.pieces.length, 0) + prof.oversize.length;
    if (placed !== prof.pieceCount) push('—', 'krojna lista: broj komada', `${prof.profile}: na šipkama ${placed} kom, a u spisku ${prof.pieceCount}`);
    for (const b of prof.bars) {
      const len = b.stockMm ?? opts.stockMm;
      const sum = b.pieces.reduce((s, pc) => s + pc.lengthMm - (pc.share ?? 0), 0);
      const used = len - b.leftoverMm;
      if (b.leftoverMm < -0.5) push('—', 'krojna lista: ostatak', `${prof.profile}: šipka ${len} mm ima negativan ostatak ${fmt(b.leftoverMm)} mm`);
      if (used + 0.5 < sum || used > sum + b.pieces.length * opts.kerfMm + 0.5) push('—', 'krojna lista: zbir šipke', `${prof.profile}: komadi ${fmt(sum)} mm + rezovi, a iskorišćeno ${fmt(used)} mm od ${len}`);
      for (const pc of b.pieces) if (!(pc.lengthMm > 0) || !Number.isFinite(pc.lengthMm)) push(String(pc.pos), 'krojna lista: dužina komada', `${prof.profile} „${pc.part}“: ${pc.lengthMm}`);
    }
    if (prof.oversize.length) push('—', 'krojna lista: komad duži od šipke', `${prof.profile}: ${prof.oversize.map((o) => `${o.part} ${o.lengthMm} mm (poz. ${o.pos})`).join(', ')}`, 'upozorenje');
    const sumQty = prof.summary.reduce((n, s) => n + s.qty, 0);
    if (sumQty !== prof.pieceCount) push('—', 'krojna lista: zbirni spisak', `${prof.profile}: zbirni spisak ${sumQty} kom, komada ${prof.pieceCount}`);
  }

  /* ---------- 2. krojna lista ↔ spisak rezova po elementu ---------- */
  const piecesByPos = new Map<string, Map<string, number>>();
  for (const prof of cl.profiles) for (const pc of [...prof.bars.flatMap((b) => b.pieces), ...prof.oversize]) {
    const m = piecesByPos.get(pc.pos) ?? new Map<string, number>();
    const k = `${prof.profile}|${pc.lengthMm}`;
    m.set(k, (m.get(k) ?? 0) + 1); piecesByPos.set(pc.pos, m);
  }

  p.items.forEach((it, idx) => {
    if (it.kind === 'opening') return;
    const el = label(idx);
    const li = layout.items[idx];
    const pos = wo.positionOfItem(idx);
    const own = rows.filter((r) => r.index === idx && !r.glass);
    if (!pos) {
      if (own.length) push(el, 'krojna lista: pozicija', 'element ima delove za sečenje, a nema poziciju u krojnoj listi');
      else push(el, 'krojna lista: element bez delova', 'element nema nijedan komad za sečenje (prazna krojna lista za element)', 'upozorenje');
    }
    // komadi elementa u krojnoj listi = redovi spiska rezova
    // (modeli 04, 06 i 08 imaju zasebnu radnu sastavnicu, pa nemaju redove u spisku rezova)
    if (pos && /^\d+$/.test(pos) && own.length) {
      const want = new Map<string, number>();
      for (const r of own) {
        // šina / C-profil duži od šipke: cele šipke + nastavak
        const lens = r.joinable && r.lengthMm > opts.stockMm ? [...Array(Math.floor(r.lengthMm / opts.stockMm)).fill(opts.stockMm), ...(r.lengthMm % opts.stockMm ? [Math.round(r.lengthMm % opts.stockMm)] : [])] : [r.lengthMm];
        for (const l of lens) { const k = `${r.profile}|${l}`; want.set(k, (want.get(k) ?? 0) + r.qty); }
      }
      const got = piecesByPos.get(pos) ?? new Map();
      const keys = new Set([...want.keys(), ...got.keys()]);
      const diff = [...keys].filter((k) => (want.get(k) ?? 0) !== (got.get(k) ?? 0)).map((k) => `${k.replace('|', ' ')} mm: spisak ${want.get(k) ?? 0}, krojna ${got.get(k) ?? 0}`);
      if (diff.length) push(el, 'krojna lista ↔ spisak rezova', diff.join('; '));
    }

    /* ---------- 3. radni nalog ---------- */
    const we = wo.elements.find((e) => e.key === pos);
    if (pos && !we) push(el, 'radni nalog: element', `pozicija ${pos} nije u radnom nalogu`);
    if (we) {
      const partsQty = we.parts.filter((x) => x.lengthMm !== null).reduce((n, x) => n + x.qty, 0);
      const cutQty = [...(piecesByPos.get(pos!)?.values() ?? [])].reduce((n, v) => n + v, 0);
      if (partsQty !== cutQty) push(el, 'radni nalog ↔ krojna lista', `delova u nalogu ${partsQty}, komada u krojnoj listi ${cutQty}`);
      const fact = (l: string) => we.facts.find((f) => f.label === l)?.value;
      const isSl = it.kind === 'gate' && !!it.sliding;
      if (!isSl) {
        const w = fact('Ukupna širina'); const h = fact('Visina');
        if (w !== `${Math.round(outerWidthMm(p, idx))} mm`) push(el, 'radni nalog: širina', `piše ${w}, a element je ${Math.round(outerWidthMm(p, idx))} mm`);
        if (h !== `${Math.round(it.heightMm)} mm`) push(el, 'radni nalog: visina', `piše ${h}, a element je ${Math.round(it.heightMm)} mm`);
      }
      // broj profila ispune / letvica u nalogu = broj glavnih komada u krojnoj listi
      const modelOf = it.kind === 'fence' ? it.modelId : it.infillModelId;
      const def = FENCE_MODELS[modelOf];
      const nFact = fact('Profila ispune');
      if (nFact && def) {
        const mainRows = rows.filter((r) => r.index === idx && r.part === def.parts.main);
        const n = mainRows.reduce((s, r) => s + r.qty, 0);
        if (mainRows.length && String(n) !== nFact) push(el, 'radni nalog: broj profila ispune', `nalog kaže ${nFact}, krojna lista ima ${n} kom „${def.parts.main}“`);
      }
      if (isSl && it.kind === 'gate' && it.sliding) {
        const r = resolveSliding(it.sliding, li.clearWidth, slidingH(it));
        const bom = slidingBom(r);
        const rail = bom.find((b) => b.key === 'rail'); const carrier = bom.find((b) => b.key === 'carrier');
        const sina = fact('Šina'); const cp = fact('C-profil');
        if (rail && sina && sina !== `${rail.cutMm} mm`) push(el, 'radni nalog: šina', `nalog ${sina}, sastavnica sklopa ${rail.cutMm} mm`);
        if (carrier && cp && cp !== `${carrier.cutMm} mm`) push(el, 'radni nalog: C-profil', `nalog ${cp}, sastavnica sklopa ${carrier.cutMm} mm`);
        const railRow = own.find((x) => x.part === rail?.name); const carRow = own.find((x) => x.part === carrier?.name);
        if (rail && !railRow) push(el, 'krojna lista: šina', 'podna šina nije u krojnoj listi', 'upozorenje');
        if (carrier && !carRow) push(el, 'krojna lista: C-profil', 'noseći C-profil nije u krojnoj listi', 'upozorenje');
      }
    }

    /* ---------- 4. skica ↔ krojna lista ---------- */
    let model; try { model = elementModel(p, idx, materials, layout); } catch (e) { push(el, 'skica', `skica se ne pravi: ${(e as Error).message}`); return; }
    if (!model) { push(el, 'skica', 'element nema skicu', 'upozorenje'); return; }
    // mera skice = mera polja / krila iz kojeg se seku delovi
    let wantW = li.clearWidth; let wantH = it.kind === 'gate' ? leafHeightOf(it) : it.heightMm;
    if (it.kind === 'gate') {
      wantW = gateSpecWidth(it, li.clearWidth);
      if (it.gateType === 'double') wantW = gateLeafPoses(it, li.clearStart, li.clearEnd, 0)[0]?.widthMm ?? wantW;
      if (it.sliding) { const r = resolveSliding(it.sliding, li.clearWidth, slidingH(it)); wantW = r.W; wantH = r.frameHeight; }
    }
    if (!near(model.widthMm, wantW, 1) || !near(model.heightMm, wantH, 1)) push(el, 'skica: mera', `skica ${fmt(model.widthMm)} × ${fmt(model.heightMm)} mm, a ${it.kind === 'gate' ? 'krilo' : 'polje (svetli otvor)'} je ${fmt(wantW)} × ${fmt(wantH)} mm`);
    let sk; try { sk = buildSketch(model, materials); } catch (e) { push(el, 'skica', `buildSketch: ${(e as Error).message}`); return; }
    if (sk.missing) push(el, 'skica: materijal', `${sk.missing} delova sa materijalom koga nema u cenovniku`, 'upozorenje');
    // delovi skice (profili) pomnoženi brojem krila ↔ delovi elementa iz spiska rezova (bez okova klizne kapije)
    const leaves = it.kind === 'gate' && it.gateType === 'double' ? 2 : 1;
    const skMap = new Map<string, number>();
    for (const pos2 of sk.positions) {
      if (pos2.kind !== 'linear') continue;
      const len = Math.round(Number(pos2.length.replace('−', '-').replace(',', '.')));
      const k = `${materialName(materials, pos2.materialId)}|${len}`;
      skMap.set(k, (skMap.get(k) ?? 0) + pos2.count * leaves);
    }
    // komadi elementa iz krojne liste (sa šipki), bez kliznog okova (šina, C-profil, rep) koji nije deo krila
    const cutMap = new Map<string, number>();
    const slidingKit = it.kind === 'gate' && it.sliding ? new Set(slidingBom(resolveSliding(it.sliding, li.clearWidth, slidingH(it))).map((b) => b.name)) : new Set<string>();
    for (const prof of cl.profiles) for (const pc of [...prof.bars.flatMap((b) => b.pieces), ...prof.oversize]) {
      if (pc.pos !== pos || slidingKit.has(pc.name ?? pc.part)) continue;
      const k = `${prof.profile}|${pc.lengthMm}`; cutMap.set(k, (cutMap.get(k) ?? 0) + 1);
    }
    // poređenje sa tolerancijom 1 mm na dužini (zaokruživanje)
    const take = (m: Map<string, number>, prof: string, len: number, n: number) => {
      for (const d of [0, -1, 1]) { const k = `${prof}|${len + d}`; const v = m.get(k) ?? 0; if (v > 0) { const t = Math.min(v, n); m.set(k, v - t); return t; } }
      return 0;
    };
    const skLeft = new Map(skMap); const cutLeft = new Map(cutMap);
    for (const [k, n] of skMap) { const [prof, l] = [k.slice(0, k.lastIndexOf('|')), Number(k.slice(k.lastIndexOf('|') + 1))]; const t = take(cutLeft, prof, l, n); skLeft.set(k, (skLeft.get(k) ?? 0) - t); }
    const onlySketch = [...skLeft].filter(([, n]) => n > 0).map(([k, n]) => `${n}× ${k.replace('|', ' ')} mm`);
    const onlyCut = [...cutLeft].filter(([, n]) => n > 0).map(([k, n]) => `${n}× ${k.replace('|', ' ')} mm`);
    if (onlySketch.length || onlyCut.length) push(el, 'skica ↔ krojna lista', [onlySketch.length ? `samo na skici: ${onlySketch.join(', ')}` : '', onlyCut.length ? `samo u krojnoj listi: ${onlyCut.join(', ')}` : ''].filter(Boolean).join(' | '));
  });

  /* ---------- 5. stubovi u radnom nalogu ---------- */
  const visiblePosts = layout.posts.filter((x) => !x.hidden).length;
  if (wo.posts.length !== visiblePosts) push('Stubovi', 'radni nalog: stubovi', `u nalogu ${wo.posts.length}, na crtežu ${visiblePosts}`);
  wo.posts.forEach((wp, i) => { if (!(wp.heightMm > 0)) push('Stubovi', 'radni nalog: visina stuba', `${wp.name}: ${wp.heightMm}`); void i; });

  /* ---------- 6. sastavnica modela: greške u formulama ---------- */
  p.items.forEach((it, idx) => {
    if (it.kind === 'opening') return;
    const li = layout.items[idx];
    const modelOf = it.kind === 'fence' ? it.modelId : it.infillModelId;
    const ctx: SpecContext = { modelId: modelOf, widthMm: it.kind === 'gate' ? gateSpecWidth(it, li.clearWidth) : li.clearWidth, heightMm: it.kind === 'gate' ? leafHeightOf(it) : it.heightMm, axisMm: li.axisEnd - li.axisStart, params: it.params, doubleGate: it.kind === 'gate' && it.gateType === 'double' };
    for (const ev of evaluateItemSpec(specFor(modelOf, specs), ctx)) if (ev.error) push(label(idx), 'sastavnica: formula', `${ev.part.name}: ${ev.error}`);
  });
  void customModelOf;
  return out;
}

/**
 * Za proveru u pretraživaču: nacrtani modeli i obrisani modeli korisnika se upisuju u katalog ovog modula (samo u memoriji; ništa se
 * ne čuva), pa se vraća spisak modela sa stranice „Modeli ograda“.
 */
export function prepareAudit(customModels: CustomModel[] | undefined, materials: Material[], hidden?: string[]): string[] {
  registerCustomModels(customModels, materials);
  setHiddenModels(hidden);
  return allFenceModels().map((m) => m.id);
}

/** Provera svih modela; `models` su ID-ovi (npr. allFenceModels().map((m) => m.id)). */
export function auditAll(models: string[], materials: Material[], specs: ModelSpecs | undefined, opts: CutOptions): Finding[] {
  return models.flatMap((id) => auditModel(id as FenceModelId, materials, specs, opts));
}
