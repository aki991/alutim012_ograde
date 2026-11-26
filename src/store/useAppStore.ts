import { useMemo } from 'react';
import { isTerraceBoundary, parseTerracePostId, patchTerracePost } from '../domain/geometry/terracePosts';
import { create } from 'zustand';
import { isBuiltinMaterial } from '../data/materials';
import { DEFAULT_CARRIAGES, DEFAULT_PLATES, DEFAULT_RAILS, missingModelMaterials } from '../data/modelMaterials';
import { mergeTerraceRuns, withRunPosts } from '../domain/geometry/runPosts';
import { withSquareGlassMaterials, withTerraceMaterials } from '../data/terraceMaterials';
import { createSeedData } from '../data/seed';
import { loadAll, saveAll, wipeAll } from '../db';
import {
  changeColor, changeFinish, changeModelAll, widthChangeProblem, setItemsWidth, duplicateItem, indexOfItem, insertItem, moveItemBy, setItemPostsRemoved, setOuterWidth, withConcretePosts, updateItem, updateItemParams, updatePost,
} from '../domain/geometry/operations';
import { newItemFor } from '../domain/geometry/newItem';
import { computeLayout } from '../domain/geometry/layout';
import { removeStair, setStairGroup } from '../domain/geometry/stairOps';
import { defaultModelId, FENCE_MODELS, REMOVED_MODELS, TERRACE_NO_GATES, isTerraceModel, projectModelId } from '../domain/models/catalog';
import { allFenceModels, customModelOf, effectiveModelId, registerCustomModels, setHiddenModels } from '../domain/models/customRegistry';
import type { CustomModel } from '../domain/models/custom';
import { drawnFrameOf, framedModelId, hasRealFrame, suggestFrameMaterial, wantsGateFrame } from '../domain/models/gateFrame';
import { RAM_TUBE_DEFAULT_MM, isTubesModel, tubesDims } from '../domain/models/tubes';
import { presetTitle, slidingForModel, specFromPreset, type SlidingSpec } from '../domain/gates/slidingAssembly';
import { defaultGateConfig, gateClearWidth, gateConfigFromGate, gateFieldsFromModel, GATE_TYPE_LABELS, leafKeyOf, postDimsOf, withModelPosts } from '../domain/gates/gateModels';
import { postHalfSum } from '../domain/geometry/layout';
import { editScopeTargets, propagateItemChange, type EditScope } from '../domain/geometry/editScope';
import { leafKey, leafSeed } from '../domain/models/leafSeed';
import { doubleGateSeed, singleGateSeed } from '../domain/models/doubleGateSeed';
import { pairWidth } from '../domain/models/pairHardware';
import { builtinToCustom } from '../domain/models/fromBuiltin';
import { cleanMaterialName } from '../domain/models/materialTitle';
import { withMaterialUnits } from '../domain/models/materialUnits';
import { withKgPrice } from '../domain/pricing/kgPrice';
import { createFence, createGate, createProject, DEFAULT_FENCE_WIDTH_MM, nowIso } from '../domain/models/factories';
import { emptyHistory, recordChange, redo as redoH, undo as undoH, type History } from '../domain/models/history';
import type {
  AppSettings, Customer, FenceModelId, FenceSection, Gate, GateType, LayoutItem, Material, Post, Project,
} from '../domain/models/types';
import { migrateProject } from '../domain/validation/project';
import { applyPostTemplate as applyPostTemplateTo } from '../domain/models/postTemplates';
import { remapMissingMaterials, repairBrokenGuides } from '../domain/models/materialRemap';
import { bookProjectStock, isStockStatus, unbookProjectStock } from '../domain/pricing/stockBooking';
import { uid } from '../utils/id';
import { stripGateCornerCuts } from '../domain/models/cornerCut';

export interface RemotePatch {
  projects?: { upsert: Project[]; remove: string[] };
  customers?: { upsert: Customer[]; remove: string[] };
  materials?: { upsert: Material[]; remove: string[] };
  /** podešavanja se šalju kao cela vrednost (sklopljena iz redova) */
  settings?: AppSettings;
}

export type SaveStatus = 'saved' | 'saving' | 'error';
export type Selection = { type: 'item' | 'post'; id: string } | null;
export type EditorView = 'front' | 'top' | 'three' | 'split' | 'dims' | 'bom' | 'photo';

export type NewElementSpec =
  | { kind: 'fence'; modelId: FenceModelId; /** polje stepeništa (samo ograde za terase) */ stair?: boolean; /** polje pod uglom prema prethodnom (stepeni, samo ograde za terase): skretanje trase na njegovom levom stubu */ turnDeg?: number; /** platno bez stubova: stubovi sa obe strane se izostavljaju (osim stuba uz kapiju) */ noPosts?: boolean }
  | { kind: 'gate'; gateType: GateType; modelId?: FenceModelId; /** kapija između betonskih stubova */ concrete?: boolean; /** moj model kapije (ID) koji se postavlja umesto osnovne kapije */ gateModelId?: string }
  | { kind: 'opening' }
  | { kind: 'corner' };

interface EditorState {
  projectId: string | null;
  selection: Selection;
  /** više izabranih polja (Ctrl+klik, okvir): ID-evi svih izabranih elemenata kad ih je dva ili više; inače prazno */
  multi: string[];
  /** više izabranih stubova (Ctrl+klik): ID-evi svih izabranih stubova kad ih je dva ili više; inače prazno */
  multiPosts: string[];
  history: History<Project>;
  view: EditorView;
  /** 1 = 100% (0,1 px po mm) */
  zoom: number;
  activeModelId: FenceModelId;
  /** Poslednja poruka (upozorenje) koju editor prikazuje korisniku */
  notice: string | null;
  /** proba hoda kliznih kapija (0–100 %) po ID-u kapije: samo prikaz, ne menja projekat */
  slideTest: Record<string, number>;
  /** izabrano ojačanje/cev repa klizne kapije (ključ stavke, npr. tail-diag, tail-brace-x1) po kapiji: ističe se na crtežu radi poređenja sa krojnom listom */
  tailSel?: Record<string, string | null>;
  /** na koje elemente važe izmene podešavanja izabranog elementa (samo on, sva platna / sve kapije, ili sve) */
  scope?: EditScope;
}

interface AppState {
  ready: boolean;
  loadError: string | null;
  projects: Project[];
  customers: Customer[];
  materials: Material[];
  settings: AppSettings;
  saveStatus: SaveStatus;
  saveError: string | null;
  editor: EditorState;

  init: () => Promise<void>;
  resetDemo: () => Promise<void>;
  /** primena izmena iz baze (sinhronizacija): zamenjuje ili dodaje redove po ID-u i uklanja obrisane; ne dira otvoren projekat koji je menjan lokalno */
  applyRemote: (patch: RemotePatch) => void;
  setSaveStatus: (s: SaveStatus, err?: string | null) => void;

  newProject: (opts?: { name?: string; customerId?: string | null; modelId?: FenceModelId; startGate?: GateType }) => string;
  openProject: (id: string) => void;
  patchProject: (id: string, patch: Partial<Project>) => void;
  /** potvrda sečenja: materijal iz krojne liste se knjiži u magacin (komadi iz magacina se skidaju, ostaci se dodaju), nezavisno od statusa */
  confirmCutting: (id: string) => void;
  /** poništava knjiženje sečenja (komadi se vraćaju, dodati ostaci se skidaju) */
  undoCutting: (id: string) => void;
  removeProject: (id: string) => void;
  copyProject: (id: string) => string | null;
  importProject: (p: Project) => string;

  mutate: (fn: (p: Project) => Project, key?: string | null) => void;
  undo: () => void;
  redo: () => void;
  select: (s: Selection) => void;
  /** Ctrl+klik: dodaje element u izbor ili ga izbacuje iz njega */
  toggleItem: (id: string) => void;
  togglePost: (id: string) => void;
  selectPosts: (ids: string[]) => void;
  /** izbor više elemenata odjednom (okvir, Shift+klik); `add` dodaje na postojeći izbor */
  selectItems: (ids: string[], add?: boolean) => void;
  setView: (v: EditorView) => void;
  setZoom: (z: number) => void;
  setActiveModel: (m: FenceModelId) => void;
  setNotice: (n: string | null) => void;

  addElement: (spec: NewElementSpec, index?: number) => string | null;
  deleteSelected: () => void;
  duplicateSelected: (count?: number) => void;
  setEditScope: (scope: EditScope) => void;
  moveSelected: (delta: -1 | 1) => void;
  patchItem: (id: string, patch: Partial<FenceSection> | Partial<Gate> | { widthMm?: number; heightMm?: number; bendDeg?: number }, key?: string) => void;
  patchItemParams: (id: string, patch: Partial<FenceSection['params']>, key?: string) => void;
  patchPost: (id: string, patch: Partial<Post>, key?: string) => void;
  setItemModel: (id: string, modelId: FenceModelId) => void;
  /** ram kapije od kvadratne cevi (materijal iz cenovnika); null = bez rama */
  /** ram kapije: cev (null = bez rama, odnosno ram iz crteža) i koja strana cevi je čelo; važi i za ostale kapije po izabranom opsegu */
  setGateFrame: (itemId: string, materialId: string | null, rot?: 0 | 90) => void;
  /** model sa ramom za prikaz kapije od zadatog modela ograde (sličice na stranici Modeli kapija); isti model kad ram ne ide */
  gateInfillWithFrame: (modelId: string) => string;
  setItemColor: (id: string, color: string) => void;
  setItemFinish: (id: string, finish: import('../domain/models/types').Finish | undefined) => void;
  /** zadaje spoljnu širinu platna; sa zaključanom ukupnom dužinom se ostala platna prilagođavaju, a ako ne može — obaveštenje i bez izmene */
  setWidth: (id: string, outerMm: number, key?: string) => boolean;
  /**
   * širina iz svojstava elementa: svetla (platno bez stubića) ili spoljna (sa stubićima). Važi za izabrani opseg izmena
   * („Sva platna“: sva platna dobijaju istu širinu); ako ne može — obaveštenje i bez izmene
   */
  setItemWidth: (id: string, mm: number, mode: 'clear' | 'outer', key?: string) => boolean;

  upsertCustomer: (c: Customer) => void;
  removeCustomer: (id: string) => void;
  upsertMaterial: (m: Material) => void;
  setMaterials: (list: Material[]) => void;
  /** jedna cena po kg za cevi (i U profile): upisuje se u podešavanja i odmah preračunava cene svih tih materijala; null je isključuje */
  setKgPrice: (kg: import('../domain/pricing/kgPrice').KgPrice | null) => void;
  removeMaterial: (id: string) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  /** briše ručno nacrtan model; projekti koji ga koriste prelaze na podrazumevani model iz kataloga */
  removeCustomModel: (id: string) => void;
  /** dorada modela iz kataloga: pravi crtež od njegovih delova kao nov model (nov tip) i vraća njegov ID */
  startDorada: (builtinId: FenceModelId) => string;
  /** dorađen model zamenjuje model iz kataloga („sačuvaj na istom tipu“): projekti sa originalom prelaze na njega */
  replaceBuiltin: (customId: string) => void;
  /** vraća originalni model iz kataloga; dorađen crtež ostaje kao poseban model */
  restoreBuiltin: (customId: string) => void;
  /** sakriva model iz kataloga (brisanje): projekti koji ga koriste rade i dalje */
  hideModel: (id: string) => void;
  /** vraća sakrivene modele; sa `prefix` samo one čiji ID počinje njime (npr. „gate:“ za osnovne kapije) */
  restoreHiddenModels: (prefix?: string) => void;
  /** modeli kapija = nacrtani modeli vrste „Kapija“ sa podešavanjima iz „Mere kapije“ */
  /** postavlja kapiju u otvorenom projektu prema modelu (ispuna, boja, visina, tip, mere, okovi); svetli otvor je onaj iz modela */
  applyGateModel: (itemId: string, modelId: string) => boolean;
  /** vraća kapiju u projektu na običnu (osnovnu) kapiju istog tipa, uz istu ogradu */
  /** vraća kapiju na običnu; `fenceId` zadaje ogradu (inače ostaje ona koju je kapija imala) */
  applyBasicGate: (itemId: string, fenceId?: FenceModelId) => void;
  /** dodaje kapiju iz modela na kraj niza u otvorenom projektu; vraća ID kapije */
  addGateFromModel: (modelId: string, index?: number) => string | null;
  setGateModelDefault: (modelId: string, on: boolean) => void;
  /** dorada osnovne kapije: pravi crtež kapije od delova podrazumevanog modela kao nov model vrste „Kapija“ i vraća njegov ID */
  startGateDorada: (gateType: GateType, fenceModelId?: string) => string;
  /** nov projekat sa jednom kapijom iz modela; vraća ID projekta */
  newProjectFromGateModel: (modelId: string) => string | null;
  /** privremen projekat sa kapijom iz modela, otvoren u „Mere kapije“ unutar crtanja modela; vraća ID projekta i kapije */
  createGateDraft: (modelId: string) => { projectId: string; itemId: string } | null;
  /** zatvara privremen projekat: vraća podešavanja kapije (sa zadatom verzijom) i briše projekat */
  finishGateDraft: (projectId: string, version: number) => import('../domain/gates/gateModels').GateConfig | null;
  /** klizna kapija kao sklop: dodaje varijantu (preset iz JSON-a) ili korisnički šablon na kraj niza; vraća ID kapije */
  addSlidingGate: (source: { preset: import('../domain/gates/slidingAssembly').SlidingPresetId }) => string | null;
  /** izmena sklopa klizne kapije (oslonac, pogon, hod, pozicije …) */
  patchSliding: (itemId: string, patch: Partial<import('../domain/gates/slidingAssembly').SlidingSpec>, key?: string) => void;
  /** proba hoda (0–100 %): pomera samo pokretne delove na crtežu */
  setSlideTest: (itemId: string, pct: number) => void;
  /** izbor jedne cevi repa (null = bez izbora) */
  setTailSel: (itemId: string, key: string | null) => void;
  /** čuva kliznu kapiju kao imenovan šablon (nezavisna kopija); vraća ID šablona */
  /** dodaje ili menja šablon stuba (Podešavanja → Šabloni stubova) */
  upsertPostTemplate: (t: import('../domain/models/types').PostTemplate) => void;
  removePostTemplate: (id: string) => void;
  /** primenjuje šablon stuba na stubove aktivnog projekta (jedna izmena u istoriji) */
  applyPostTemplate: (templateId: string, postIds: string[]) => void;
  /** Doradi: nov model klizne kapije iz polazne varijante (nezavisna kopija koja se menja u crtežu modela) */
  startSlidingDorada: (presetId: import('../domain/gates/slidingAssembly').SlidingPresetId, fenceModelId?: string) => string;
  /** izmena modela klizne kapije; projekti koji su ga već koristili imaju svoju kopiju i ne menjaju se */
  /** nov projekat sa kliznom kapijom iz polazne varijante ili iz modela */
  newProjectFromSliding: (source: { preset: import('../domain/gates/slidingAssembly').SlidingPresetId }) => string | null;
}

/** Element čiji model više ne postoji (obrisan nacrtani model) prelazi na podrazumevani model, da se projekat i dalje otvara. */
export const dropUnknownModels = (p: Project): Project => {
  const known = (id: string) => id in FENCE_MODELS;
  if (p.items.every((it) => it.kind === 'opening' || known(it.kind === 'fence' ? it.modelId : it.infillModelId))) return p;
  const d = FENCE_MODELS[defaultModelId()];
  return {
    ...p,
    items: p.items.map((it) => {
      if (it.kind === 'fence' && !known(it.modelId)) return { ...it, modelId: defaultModelId(), materialId: d.materialId, params: { ...d.defaults } };
      if (it.kind === 'gate' && !known(it.infillModelId)) return { ...it, infillModelId: defaultModelId(), params: { ...d.defaults } };
      return it;
    }),
  };
};

/** model ograde izabran u ovoj sesiji (važi dok se prozor ne zatvori ili ne počne novi projekat) */
const ACTIVE_MODEL_KEY = 'alutim.activeModel';
const rememberActiveModel = (id: string | null): void => { try { if (id) sessionStorage.setItem(ACTIVE_MODEL_KEY, id); else sessionStorage.removeItem(ACTIVE_MODEL_KEY); } catch { /* bez sessionStorage-a */ } };
const isListedModel = (id: string): boolean => allFenceModels().some((m) => m.id === id);
/** prvi model sa stranice Modeli ograda */
const firstListedModel = (): FenceModelId => (allFenceModels().find((m) => !m.terrace)?.id ?? defaultModelId()) as FenceModelId;
const sessionModel = (): FenceModelId | null => { try { const v = sessionStorage.getItem(ACTIVE_MODEL_KEY); return v && isListedModel(v) ? (v as FenceModelId) : null; } catch { return null; } };

const emptyEditor = (): EditorState => ({
  projectId: null, selection: null, multi: [], multiPosts: [], history: emptyHistory<Project>(), view: 'front', zoom: 1, activeModelId: defaultModelId(), notice: null, slideTest: {},
});

/** Izbor više polja ostaje samo za elemente koji i dalje postoje; sa manje od dva izabrana nema višestrukog izbora. */
const keepMulti = (multi: string[], p: Project): string[] => {
  const left = multi.filter((id) => p.items.some((i) => i.id === id));
  return left.length > 1 ? left : [];
};

/** Selekcija se zadržava posle undo/redo ako element i dalje postoji u projektu. */
const keepSelection = (sel: Selection, p: Project): Selection => {
  if (!sel) return null;
  const modelPost = sel.type === 'post' ? parseTerracePostId(sel.id) : null;
  const exists = sel.type === 'item' ? p.items.some((i) => i.id === sel.id) : modelPost ? p.items.some((i) => i.kind === 'fence' && i.id === modelPost.itemId && i.params.slats?.postsEnabled !== false && !i.params.slats?.postOverrides?.[modelPost.key]?.removed) : p.posts.some((x) => x.id === sel.id && !x.removed);
  return exists ? sel : null;
};

const nextQuoteNo = (projects: Project[]): string => {
  const year = new Date().getFullYear();
  const max = projects.reduce((m, p) => {
    const mt = /^P-\d{4}-(\d+)$/.exec(p.quoteNo);
    return mt ? Math.max(m, Number(mt[1])) : m;
  }, 0);
  return `P-${year}-${String(max + 1).padStart(3, '0')}`;
};

/** privremen projekat za „Mere kapije“ u crtanju modela → projekat koji je bio otvoren pre njega */
const DRAFT_PREV = new Map<string, string | null>();

/** oznaka da su ranije napravljeni projekti na ovom uređaju obrisani (jednokratno, pre uključivanja baze) */
export const PROJECTS_WIPED_KEY = 'alutim.projectsWipedV1';
const LAST_PROJECT_KEY = 'alu-tim.lastProject';
const rememberProject = (id: string) => { try { localStorage.setItem(LAST_PROJECT_KEY, id); } catch { /* privatni režim: bez pamćenja */ } };
const recalledProject = (): string | null => { try { return localStorage.getItem(LAST_PROJECT_KEY); } catch { return null; } };

/** Projekat koji se trenutno radi: otvoren u editoru, inače poslednji otvoren (pamti se i posle ponovnog pokretanja), inače poslednje menjan. */
export function currentProjectId(): string | null {
  const { projects, editor } = useAppStore.getState();
  if (editor.projectId && projects.some((p) => p.id === editor.projectId)) return editor.projectId;
  const last = recalledProject();
  if (last && projects.some((p) => p.id === last)) return last;
  const newest = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return newest?.id ?? null;
}

/** zamenjuje redove po ID-u (novi idu na početak), uklanja obrisane; vraća isti niz ako se ništa ne menja */
function mergeById<T extends { id: string }>(cur: T[], upsert: T[], remove: string[]): T[] {
  if (!upsert.length && !remove.length) return cur;
  const rm = new Set(remove);
  const byId = new Map(upsert.map((x) => [x.id, x]));
  const seen = new Set<string>();
  const kept = cur.filter((x) => !rm.has(x.id)).map((x) => { const n = byId.get(x.id); if (n) seen.add(x.id); return n ?? x; });
  return [...upsert.filter((x) => !seen.has(x.id)), ...kept];
}

/** početni podaci nove instalacije: bez probnih projekata (projekti dolaze iz baze ili se prave ručno) */
const freshSeed = () => {
  const data = createSeedData();
  return { ...data, materials: withSquareGlassMaterials(data.materials) ?? data.materials, projects: [] as Project[] };
};

const seed = createSeedData();

/** Elementi projekta sa modelom iz skupa `from` prelaze na model `to` (ograde i ispuna kapija); mere i boje ostaju. */
function switchModel(p: Project, from: Set<string>, to: string): Project {
  if (!p.items.some((it) => (it.kind === 'fence' && from.has(it.modelId)) || (it.kind === 'gate' && from.has(it.infillModelId)))) return p;
  const items = p.items.map((it) => (it.kind === 'fence' && from.has(it.modelId) ? { ...it, modelId: to as FenceModelId } : it.kind === 'gate' && from.has(it.infillModelId) ? { ...it, infillModelId: to as FenceModelId } : it));
  return { ...p, items, updatedAt: new Date().toISOString() };
}

export const useAppStore = create<AppState>((set, get) => {
  const currentProject = (): Project | undefined => {
    const id = get().editor.projectId;
    return id ? get().projects.find((p) => p.id === id) : undefined;
  };

  /** izvedeni model kapije sa ramom (osnovni model + cev rama): dodaje se u katalog ako ga još nema; vraća njegov ID */
  const ensureFramedModel = (baseId: string, materialId: string, rot?: 0 | 90): string | null => {
    const id = framedModelId(baseId, materialId, rot);
    const list = get().settings.customModels ?? [];
    if (list.some((m) => m.id === id)) return id;
    const base = customModelOf(baseId);
    if (!base || !get().materials.some((m) => m.id === materialId)) return null;
    const stub: CustomModel = { id, name: base.name, kind: 'gate', widthMm: base.widthMm, heightMm: base.heightMm, color: base.color, parts: [], derivedFrom: baseId, frameMaterialId: materialId, ...(rot !== undefined ? { frameRot: rot } : {}), updatedAt: new Date().toISOString() };
    const customModels = [...list, stub];
    registerCustomModels(customModels, get().materials);
    set((s) => ({ settings: { ...s.settings, customModels } }));
    return id;
  };

  /**
   * Svaka nova kapija (ili kapija kojoj je promenjen model) dobija ram: ručno nacrtan model bez rama dobija cev po dubini modela, a model
   * sa cevima u U profilima ram od kvadratne cevi. Ram se menja u podešavanjima kapije; izbor „bez rama“ se pamti.
   */
  const withGateFrames = (p: Project, prev?: Project): Project => {
    let changed = false;
    const items = p.items.map((it): LayoutItem => {
      // klizna kapija sa krilom od modela (kao na stranici Modeli kapija) dobija isti ram kao krilne; stari sklop sa svojim ramom ne
      const sliding = it.kind === 'gate' && it.gateType === 'sliding';
      if (it.kind !== 'gate' || (sliding && it.sliding && !it.sliding.drawnLeaf)) return it;
      const was = prev?.items.find((x) => x.id === it.id);
      const gf = it.params.gateFrame;
      const ours = !!gf && it.infillModelId === framedModelId(gf.baseId, gf.materialId, gf.rot);
      // klizna kapija dodata pre ovog pravila (ram nikad nije određen) dobija ram pri prvoj izmeni projekta
      if (was && was.kind === 'gate' && (was.infillModelId === it.infillModelId || ours) && !(sliding && gf === undefined)) return it;
      // „bez rama“ izabrano na kapiji sa ramom: model se vraća na osnovni i tako ostaje
      if (was && was.kind === 'gate' && gf === null && was.params.gateFrame?.baseId === it.infillModelId) return it;
      if (!was && gf !== undefined && ours) return it;
      const base = (ours ? gf!.baseId : it.infillModelId) as string;
      const decide = (patch: Partial<Gate['params']>, infill?: string): LayoutItem => { changed = true; return { ...it, ...(infill ? { infillModelId: infill as FenceModelId } : {}), params: { ...it.params, ...patch } } as LayoutItem; };
      // klizna kapija od modela sa cevima u U profilima: krilo je isto kao na stranici Modeli kapija (bez dodatog rama)
      if (sliding && isTubesModel(base as FenceModelId)) return decide({ gateFrame: null }, base);
      if (isTubesModel(base as FenceModelId)) {
        const ram = it.params.ram ?? 'tube';
        return decide({ gateFrame: null, ram, ...(ram === 'tube' && it.params.ramMm === undefined ? { ramMm: Math.max(RAM_TUBE_DEFAULT_MM, Math.round(tubesDims(it.params).uDepthMm)) } : {}) }, base);
      }
      const m = customModelOf(base);
      if (m && m.kind === 'fence' && !m.derivedFrom && wantsGateFrame(m) && !hasRealFrame(m, get().materials)) {
        const mat = suggestFrameMaterial(m, get().materials);
        const id = mat ? ensureFramedModel(base, mat.id) : null;
        if (mat && id) return decide({ gateFrame: { baseId: base, materialId: mat.id } }, id);
      }
      return decide({ gateFrame: null }, base);
    });
    return changed ? { ...p, items } : p;
  };

  return {
    ready: false,
    loadError: null,
    projects: [],
    customers: [],
    materials: [],
    settings: seed.settings,
    saveStatus: 'saved',
    saveError: null,
    editor: emptyEditor(),

    async init() {
      try {
        const data = await loadAll();
        if (!data.seeded) {
          const s = freshSeed();
          await saveAll(s);
          try { localStorage.setItem(PROJECTS_WIPED_KEY, '1'); } catch { /* bez localStorage-a: preskače se */ }
          set({ ...s, ready: true });
        } else {
          let settings = data.settings ?? seed.settings;
          let materials = data.materials.filter((m) => !isBuiltinMaterial(m));
          // jednokratno: materijali iz specifikacija modela koji još nisu u cenovniku dobijaju mesto u listi (okvirne cene)
          const BACKFILL_KEY = 'alutim.modelMaterialsV1';
          let backfilled = false;
          try {
            if (localStorage.getItem(BACKFILL_KEY) !== '1') {
              materials = [...materials, ...missingModelMaterials(materials)];
              backfilled = true;
            }
          } catch { /* bez localStorage-a: preskače se */ }
          // jednokratno: okov dvokrilne kapije (prihvatnik brave, podni zasun, podni prihvat) dodaje se u cenovnik samo ako ga nema; ostalo se ne vraća
          const PAIR_KEY = 'alutim.pairHardwareV1';
          try {
            if (localStorage.getItem(PAIR_KEY) !== '1') {
              const ids = new Set(['mat_strike_plate', 'mat_floor_bolt', 'mat_floor_catch']);
              const add = missingModelMaterials(materials).filter((x) => ids.has(x.id));
              if (add.length) { materials = [...materials, ...add]; backfilled = true; }
              localStorage.setItem(PAIR_KEY, '1');
            }
          } catch { /* bez localStorage-a: preskače se */ }
          // jednokratno: nazivi materijala iz uvoza postaju „vrsta pa dimenzije“ (npr. Kvadratna cev 60×40×3, U profil 60×28)
          const NAMES_KEY = 'alutim.materialNamesV2'; // V2: izbacuje i oznake boje (RAL)
          let renamed = false;
          try {
            if (localStorage.getItem(NAMES_KEY) !== '1') {
              const clean = materials.map((m) => { const n = cleanMaterialName(m.name); return n === m.name ? m : { ...m, name: n }; });
              if (clean.some((m, i) => m !== materials[i])) { materials = clean; renamed = true; }
              if (!renamed) localStorage.setItem(NAMES_KEY, '1');
            }
          } catch { /* bez localStorage-a: preskače se */ }
          // jednokratno: primeri kolica samonoseće kapije (materijal sa merama koje se menjaju) dobijaju mesto u cenovniku
          const CARRIAGES_KEY = 'alutim.carriagesV1';
          let carriagesAdded = false;
          try {
            if (localStorage.getItem(CARRIAGES_KEY) !== '1') {
              if (!materials.some((m) => /kolic/i.test(m.name))) {
                const have = new Set(materials.map((m) => m.id));
                materials = [...materials, ...DEFAULT_CARRIAGES.filter((m) => !have.has(m.id)).map((m) => ({ ...m }))];
                carriagesAdded = true;
              } else localStorage.setItem(CARRIAGES_KEY, '1');
            }
          } catch { /* bez localStorage-a: preskače se */ }
          // jednokratno: profilisan rukohvat (nacrtan presek sa žlebovima) dobija mesto u cenovniku
          // i lim za popunu pada terena (jednokratno, svaki spisak sa svojom oznakom)
          const RAIL_KEY = 'alutim.railProfileV1';
          const extraAdded: string[] = [];
          for (const [key, list] of [[RAIL_KEY, DEFAULT_RAILS], ['alutim.slopePlateV1', DEFAULT_PLATES]] as [string, Material[]][]) {
            try {
              if (localStorage.getItem(key) !== '1') {
                const have = new Set(materials.map((m) => m.id));
                const add = list.filter((m) => !have.has(m.id));
                if (add.length) { materials = [...materials, ...add.map((m) => ({ ...m }))]; extraAdded.push(key); } else localStorage.setItem(key, '1');
              }
            } catch { /* bez localStorage-a: preskače se */ }
          }
          const railAdded = extraAdded.length > 0;
          // jednokratno: materijali za ograde za terase (BTS stubovi, rukohvati, prečke, staklo i okov) i oznaka „za terase“ na starim BTS materijalima
          const TERRACE_KEY = 'alutim.terraceMaterialsV2';
          let terraceAdded = false;
          try {
            if (localStorage.getItem(TERRACE_KEY) !== '1') {
              const next = withTerraceMaterials(materials);
              if (next) { materials = next; terraceAdded = true; } else localStorage.setItem(TERRACE_KEY, '1');
            }
          } catch { /* bez localStorage-a: preskače se */ }
          // Staklena ograda sa kvadratnim stubovima: dopuna i za cenovnike koji su već prošli uvoz terasnih materijala.
          const SQUARE_GLASS_KEY = 'alutim.squareGlassMaterialsV1';
          let squareGlassAdded = false;
          try {
            if (localStorage.getItem(SQUARE_GLASS_KEY) !== '1') {
              const next = withSquareGlassMaterials(materials);
              if (next) { materials = next; squareGlassAdded = true; } else localStorage.setItem(SQUARE_GLASS_KEY, '1');
            }
          } catch { /* bez localStorage-a: preskače se */ }
          // cene cevi pod zajedničkom cenom po kg prate masu i posle dopune mase
          const massMaterials = materials.map((m) => withKgPrice(withMaterialUnits(m), settings.kgPrice));
          const massChanged = massMaterials.some((m, i) => m !== materials[i]);
          materials = massMaterials;
          // delovi nacrtanih modela sa obrisanim materijalom prelaze na isti materijal (ista šifra) iz cenovnika, npr. čep tarabice K100018
          const remapped = remapMissingMaterials(settings.customModels, materials);
          if (remapped) settings = { ...settings, customModels: remapped };
          // prečke vezane za U vođice kojih nema u crtežu (crtež kapije od ograde): ponovo se vezuju za svoje U profile
          const reguided = repairBrokenGuides(settings.customModels, materials);
          if (reguided) settings = { ...settings, customModels: reguided };
          // kapije koje nikad nisu sačuvane (zatvoreno crtanje, osvežena stranica) se ne zadržavaju
          if (settings.customModels?.some((m) => m.draft)) settings = { ...settings, customModels: settings.customModels.filter((m) => !m.draft) };
          // nacrtani modeli moraju biti u katalogu pre nego što se projekti učitaju
          registerCustomModels(settings.customModels, materials, settings.terraceModelIds ?? []);
          setHiddenModels(settings.hiddenModels);
          // jednokratno (pre povezivanja sa bazom): brišu se svi ranije napravljeni projekti na ovom uređaju
          let wiped = false;
          try {
            if (localStorage.getItem(PROJECTS_WIPED_KEY) !== '1') wiped = true;
          } catch { /* bez localStorage-a: preskače se */ }
          // privremeni projekti za uređivanje modela ne preživljavaju ponovno pokretanje
          set({ projects: wiped ? [] : data.projects.filter((p) => !p.modelDraft).map(migrateProject).map(dropUnknownModels), customers: data.customers, materials, settings, ready: true });
          if (wiped) {
            try {
              await saveAll({ projects: [], customers: data.customers, materials, settings });
              localStorage.setItem(PROJECTS_WIPED_KEY, '1');
            } catch { /* neuspeh: pokušaće se opet pri sledećem pokretanju */ }
          }
          if (backfilled || renamed || carriagesAdded || terraceAdded || squareGlassAdded || railAdded || remapped || massChanged) {
            // autosave počinje tek posle init-a, pa se dodati materijali upisuju odmah; oznaka se postavlja tek kad je upis uspeo
            try {
              await saveAll({ projects: get().projects, customers: get().customers, materials, settings });
              if (backfilled) localStorage.setItem(BACKFILL_KEY, '1');
              if (renamed) localStorage.setItem(NAMES_KEY, '1');
              if (carriagesAdded) localStorage.setItem(CARRIAGES_KEY, '1');
              if (terraceAdded) localStorage.setItem(TERRACE_KEY, '1');
              if (squareGlassAdded) localStorage.setItem(SQUARE_GLASS_KEY, '1');
              for (const key of extraAdded) localStorage.setItem(key, '1');
            } catch { /* neuspeh ne sme da sakrije učitane podatke; pokušaće se opet pri sledećem pokretanju */ }
          }
        }
      } catch (e) {
        // IndexedDB nedostupan (npr. privatni režim): radimo u memoriji i jasno prijavljujemo grešku
        const s = freshSeed();
        set({ ...s, ready: true, loadError: `Lokalna baza nije dostupna: ${(e as Error).message}. Podaci neće biti sačuvani.`, saveStatus: 'error' });
      }
    },

    async resetDemo() {
      await wipeAll();
      const s = freshSeed();
      await saveAll(s);
      set({ ...s, editor: emptyEditor(), saveStatus: 'saved', saveError: null });
    },

    setSaveStatus(status, err = null) {
      set({ saveStatus: status, saveError: err });
    },

    applyRemote(patch) {
      set((s) => {
        const out: Partial<AppState> = {};
        if (patch.customers) {
          const customers = mergeById(s.customers, patch.customers.upsert, patch.customers.remove);
          if (customers !== s.customers) out.customers = customers;
        }
        if (patch.materials) {
          const materials = mergeById(s.materials, patch.materials.upsert.filter((m) => !isBuiltinMaterial(m)).map(withMaterialUnits), patch.materials.remove);
          if (materials !== s.materials) out.materials = materials;
        }
        // i modeli iz baze: deo sa obrisanim materijalom prelazi na isti materijal iz cenovnika (izmena se zatim šalje u bazu)
        if (patch.settings) {
          const mats = out.materials ?? s.materials;
          const fixedModels = remapMissingMaterials(patch.settings.customModels, mats) ?? patch.settings.customModels;
          const reguided = repairBrokenGuides(fixedModels, mats) ?? fixedModels;
          out.settings = reguided !== patch.settings.customModels ? { ...patch.settings, customModels: reguided } : patch.settings;
        }
        // modeli iz baze se registruju PRE provere projekata: inače bi projekat koji koristi nacrtani model (koji ovaj uređaj još nema) bio
        // vraćen na podrazumevani model, a prikaz bi pao na nepoznatom modelu i sinhronizacija bi stala sa greškom
        if (patch.settings || out.materials) registerCustomModels((out.settings ?? s.settings).customModels, out.materials ?? s.materials, (out.settings ?? s.settings).terraceModelIds ?? []);
        if (patch.projects) {
          const up = patch.projects.upsert.filter((p) => !p.modelDraft).map(migrateProject);
          const projects = mergeById(s.projects, up, patch.projects.remove);
          if (projects !== s.projects) out.projects = projects;
          // otvoren projekat koji je obrisan u bazi se zatvara
          if (s.editor.projectId && !projects.some((p) => p.id === s.editor.projectId)) out.editor = emptyEditor();
        }
        // posle izmene modela: elementi (i izabrani model) čiji model više ne postoji prelaze na podrazumevani, da se ništa ne ruši
        const base = out.projects ?? s.projects;
        const fixed = base.map(dropUnknownModels);
        if (fixed.some((p, i) => p !== base[i])) out.projects = fixed;
        const ed = out.editor ?? s.editor;
        if (!(ed.activeModelId in FENCE_MODELS)) out.editor = { ...ed, activeModelId: defaultModelId() };
        return out;
      });
    },

    newProject(opts = {}) {
      // model iz kataloga koji je zamenjen dorađenim: koristi se dorađen
      if (opts.modelId) opts = { ...opts, modelId: effectiveModelId(opts.modelId) };
      const items: LayoutItem[] = [];
      if (opts.modelId) items.push(createFence({ modelId: opts.modelId }));
      if (opts.startGate && !isTerraceModel(opts.modelId ?? defaultModelId())) items.push(createGate(opts.startGate, { infillModelId: opts.modelId ?? defaultModelId() }));
      let p = withGateFrames(createProject(opts.name ?? 'Novi projekat', items, opts.customerId ?? null));
      // univerzalna početna mera platna: svetla širina 1500 mm (ograde za terase zadržavaju svoje mere)
      if (opts.modelId && !isTerraceModel(opts.modelId)) p = setOuterWidth(p, items[0].id, DEFAULT_FENCE_WIDTH_MM + 2 * postHalfSum(p, 0));
      p.quoteNo = nextQuoteNo(get().projects);
      p.settings.pricing = { ...get().settings.pricing };
      set((s) => ({
        projects: [p, ...s.projects],
        editor: { ...emptyEditor(), projectId: p.id, activeModelId: opts.modelId ?? firstListedModel() },
      }));
      // novi projekat počinje prvim modelom sa stranice Modeli ograda
      rememberActiveModel(opts.modelId ?? null);
      rememberProject(p.id);
      return p.id;
    },

    openProject(id) {
      rememberProject(id);
      if (get().editor.projectId === id) return;
      set((s) => ({ editor: { ...s.editor, projectId: id, selection: null, multi: [], multiPosts: [], history: emptyHistory<Project>(), notice: null } }));
    },

    patchProject(id, patch) {
      set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: nowIso() } : p)) }));
    },

    confirmCutting(id) {
      const s = get();
      const p = s.projects.find((x) => x.id === id);
      if (!p || s.settings.stockBookings?.[id] || (s.settings.stockBooked ?? []).includes(id)) return;
      const r = bookProjectStock(p, s.settings, s.materials);
      set({ settings: { ...s.settings, stock: r.stock, stockBookings: { ...(s.settings.stockBookings ?? {}), [id]: r.record } } });
    },

    undoCutting(id) {
      const s = get();
      const rec = s.settings.stockBookings?.[id];
      if (!rec) return;
      const bookings = { ...(s.settings.stockBookings ?? {}) };
      delete bookings[id];
      set({ settings: { ...s.settings, stock: unbookProjectStock(s.settings.stock ?? [], rec), stockBookings: bookings } });
    },

    removeProject(id) {
      set((s) => ({
        projects: s.projects.filter((p) => p.id !== id),
        editor: s.editor.projectId === id ? emptyEditor() : s.editor,
      }));
    },

    copyProject(id) {
      const src = get().projects.find((p) => p.id === id);
      if (!src) return null;
      const copy: Project = JSON.parse(JSON.stringify(src));
      copy.id = uid('proj');
      copy.name = `${src.name} (kopija)`;
      copy.status = 'nacrt';
      copy.createdAt = nowIso();
      copy.updatedAt = nowIso();
      copy.quoteNo = nextQuoteNo(get().projects);
      copy.items = copy.items.map((i) => ({ ...i, id: uid(i.kind) }));
      copy.posts = copy.posts.map((x) => ({ ...x, id: uid('post') }));
      set((s) => ({ projects: [copy, ...s.projects] }));
      return copy.id;
    },

    importProject(p) {
      const exists = get().projects.some((x) => x.id === p.id);
      const proj: Project = exists
        ? { ...p, id: uid('proj'), name: `${p.name} (uvezeno)`, items: p.items.map((i) => ({ ...i, id: uid(i.kind) })), posts: p.posts.map((x) => ({ ...x, id: uid('post') })) }
        : p;
      if (!proj.quoteNo) proj.quoteNo = nextQuoteNo(get().projects);
      set((s) => ({ projects: [proj, ...s.projects] }));
      return proj.id;
    },

    mutate(fn, key = null) {
      const cur = currentProject();
      if (!cur) return;
      let next = fn(cur);
      if (next === cur) return;
      // izmena izabranog elementa važi i za ostale prema izabranom opsegu („Sva platna“, „Sve kapije“, „Platna i kapije“)
      const sel = get().editor.selection; const scope = get().editor.scope ?? 'one';
      if (scope !== 'one' && sel?.type === 'item') next = propagateItemChange(cur, next, sel.id, scope);
      next = stripGateCornerCuts(withGateFrames(next, cur));
      const mg = mergeTerraceRuns(next);
      next = withRunPosts(mg.project, get().materials);
      const selNow = get().editor.selection;
      const moved = selNow?.type === 'item' ? mg.merged.get(selNow.id) : undefined;
      set((s) => {
        const selection = s.editor.selection;
        const stillThere = !selection || !!keepSelection(selection, next);
        return {
          projects: s.projects.map((p) => (p.id === cur.id ? next : p)),
          editor: { ...s.editor, history: recordChange(s.editor.history, cur, key), selection: moved ? { ...selection!, id: moved } as typeof selection : stillThere ? selection : null, multi: keepMulti(s.editor.multi, next) },
        };
      });
    },

    undo() {
      const cur = currentProject();
      if (!cur) return;
      const r = undoH(get().editor.history, cur);
      if (!r) return;
      set((s) => ({ projects: s.projects.map((p) => (p.id === cur.id ? r.value : p)), editor: { ...s.editor, history: r.history, selection: keepSelection(s.editor.selection, r.value), multi: keepMulti(s.editor.multi, r.value) } }));
    },

    redo() {
      const cur = currentProject();
      if (!cur) return;
      const r = redoH(get().editor.history, cur);
      if (!r) return;
      set((s) => ({ projects: s.projects.map((p) => (p.id === cur.id ? r.value : p)), editor: { ...s.editor, history: r.history, selection: keepSelection(s.editor.selection, r.value), multi: keepMulti(s.editor.multi, r.value) } }));
    },

    select(selection) { set((s) => ({ editor: { ...s.editor, selection, multi: [], multiPosts: [] } })); },
    togglePost(id) {
      const { selection, multiPosts } = get().editor;
      const current = multiPosts.length > 1 ? multiPosts : selection?.type === 'post' ? [selection.id] : [];
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      set((s) => ({ editor: { ...s.editor, multi: [], multiPosts: next.length > 1 ? next : [], selection: next.length ? { type: 'post', id: next[next.length - 1] } : null } }));
    },
    selectPosts(ids) {
      set((s) => ({ editor: { ...s.editor, multi: [], multiPosts: ids.length > 1 ? ids : [], selection: ids.length ? { type: 'post', id: ids[ids.length - 1] } : null } }));
    },
    toggleItem(id) {
      const { selection, multi } = get().editor;
      const current = multi.length > 1 ? multi : selection?.type === 'item' ? [selection.id] : [];
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      set((s) => ({ editor: { ...s.editor, multi: next.length > 1 ? next : [], multiPosts: [], selection: next.length ? { type: 'item', id: next[next.length - 1] } : null } }));
    },
    selectItems(ids, add = false) {
      const { selection, multi } = get().editor;
      const base = add ? (multi.length > 1 ? multi : selection?.type === 'item' ? [selection.id] : []) : [];
      const next = [...base, ...ids.filter((id) => !base.includes(id))];
      set((s) => ({ editor: { ...s.editor, multi: next.length > 1 ? next : [], selection: next.length ? { type: 'item', id: next[next.length - 1] } : null } }));
    },
    setView(view) { set((s) => ({ editor: { ...s.editor, view } })); },
    setZoom(zoom) { set((s) => ({ editor: { ...s.editor, zoom: Math.min(4, Math.max(0.1, zoom)) } })); },
    setActiveModel(activeModelId) { rememberActiveModel(activeModelId); set((s) => ({ editor: { ...s.editor, activeModelId } })); },
    setNotice(notice) { set((s) => ({ editor: { ...s.editor, notice } })); },

    addElement(spec, index) {
      const cur = currentProject();
      if (!cur) return null;
      if (spec.kind === 'gate' && spec.gateModelId) return get().addGateFromModel(spec.gateModelId, index);
      const modelId = projectModelId(cur.items) ?? get().editor.activeModelId; // projekat ima jedan model: novi element je istog modela
      if (spec.kind === 'gate' && isTerraceModel(spec.modelId ?? modelId)) { get().setNotice(TERRACE_NO_GATES); return null; }
      // novi element ima mere i izgled ograde koja je već u projektu (izabrano polje, inače poslednja ograda)
      const sel = get().editor.selection;
      const { item, outerWidthMm: outer, clearWidthMm } = newItemFor(cur, spec, modelId, sel?.type === 'item' ? sel.id : null);
      get().mutate((p) => {
        let q = insertItem(p, item, index ?? p.items.length);
        if (spec.kind === 'fence' && spec.turnDeg) {
          const at = q.items.findIndex((x) => x.id === item.id);
          if (at > 0) q = { ...q, posts: q.posts.map((x, i) => (i === at ? { ...x, turnDeg: spec.turnDeg } : x)) };
        }
        // platno bez stubova izostavlja stubove sa obe strane; platno sa stubovima i kapija ih vraćaju (stubovi ograde za terasu su deo modela)
        if (spec.kind === 'fence' && spec.noPosts) q = setItemPostsRemoved(q, item.id, true);
        else if ((spec.kind === 'fence' && !isTerraceModel(spec.modelId)) || spec.kind === 'gate') q = setItemPostsRemoved(q, item.id, false);
        let w = setOuterWidth(spec.kind === 'gate' && spec.concrete ? withConcretePosts(q, item.id) : q, item.id, outer);
        // zadata svetla širina (sa U profilima): spoljna se dopuni za polovine stubova, tako da otvor bude tačno tražen
        if (clearWidthMm) {
          const li = computeLayout(w).items[indexOfItem(w, item.id)];
          if (li) w = setOuterWidth(w, item.id, outer + (clearWidthMm - li.clearWidth));
        }
        // stepenište: polja sa stubovima između (preporuka: stub na svaki metar)
        return spec.kind === 'fence' && spec.stair ? setStairGroup(w, item.id, {}) : w;
      });
      set((s) => ({ editor: { ...s.editor, selection: { type: 'item', id: item.id }, multi: [] } }));
      return item.id;
    },

    deleteSelected() {
      const { selection: sel, multi } = get().editor;
      if (sel?.type === 'post') {
        const modelPost = parseTerracePostId(sel.id);
        if (modelPost) get().mutate((p) => patchTerracePost(p, modelPost.itemId, modelPost.key, { removed: true }));
        else { const p = currentProject(); const index = p?.posts.findIndex((q) => q.id === sel.id) ?? -1;
          if (!p || index < 0 || !isTerraceBoundary(p, index)) return;
          get().mutate((pr) => ({ ...pr, posts: pr.posts.map((q) => q.id === sel.id ? { ...q, removed: true } : q) }));
        }
        set((s) => ({ editor: { ...s.editor, selection: null, multi: [], multiPosts: [] } })); return;
      }
      if (!sel || sel.type !== 'item') return;
      const ids = multi.length > 1 ? multi : [sel.id];
      // stepenište se briše ceo (sva polja između stubova)
      get().mutate((p) => ids.reduce((q, id) => (q.items.some((x) => x.id === id) ? removeStair(q, id) : q), p));
      set((s) => ({ editor: { ...s.editor, selection: null, multi: [] } }));
    },

    duplicateSelected(count = 1) {
      const sel = get().editor.selection;
      const cur = currentProject();
      if (!sel || sel.type !== 'item' || !cur || get().editor.multi.length > 1) return;
      // više kopija odjednom (npr. 10 istih platna): svaka dolazi odmah posle izabranog elementa, sve u jednom koraku za poništavanje
      const n = Math.max(1, Math.min(50, Math.floor(Number.isFinite(count) ? count : 1)));
      let project = cur; let firstId: string | null = null;
      for (let k = 0; k < n; k++) { const r = duplicateItem(project, sel.id); project = r.project; if (r.newId && !firstId) firstId = r.newId; }
      get().mutate(() => project);
      if (firstId) set((s) => ({ editor: { ...s.editor, selection: { type: 'item', id: firstId! }, multi: [] } }));
    },

    setEditScope(scope) { set((s) => ({ editor: { ...s.editor, scope } })); },

    moveSelected(delta) {
      const sel = get().editor.selection;
      if (!sel || sel.type !== 'item' || get().editor.multi.length > 1) return;
      get().mutate((p) => moveItemBy(p, sel.id, delta));
    },

    patchItem(id, patch, key) { get().mutate((p) => updateItem(p, id, patch), key ? `${key}:${id}` : null); },
    patchItemParams(id, patch, key) { get().mutate((p) => updateItemParams(p, id, patch), key ? `${key}:${id}` : null); },
    patchPost(id, patch, key) { get().mutate((p) => updatePost(p, id, patch), key ? `${key}:${id}` : null); },
    // model se menja za sve ograde i kapije u projektu (jedan izgled cele ograde)
    setItemModel(_id, modelId) {
      // ograda za terasu nema kapije: model se ne menja dok u projektu ima kapija (ništa se ne briše samo od sebe)
      const cur = currentProject();
      if (isTerraceModel(modelId) && cur?.items.some((i) => i.kind === 'gate')) {
        get().setNotice('Nije moguće: ograde za terase nemaju kapije. Prvo uklonite kapije iz projekta.');
        return;
      }
      get().mutate((p) => changeModelAll(p, modelId)); set((s) => ({ editor: { ...s.editor, activeModelId: modelId } }));
      // tip kapije važi samo za svoju ogradu: kapija sa tipom druge ograde se vraća na običnu kapiju nove ograde
      const list = get().settings.customModels ?? [];
      const key = leafKeyOf(modelId, list);
      for (const g of currentProject()?.items ?? []) {
        const type = g.kind === 'gate' ? list.find((x) => x.id === g.design?.template?.id && x.kind === 'gate') : undefined;
        if (type && type.leafModelId !== key) get().applyBasicGate(g.id, modelId);
      }
    },
    gateInfillWithFrame(modelId) {
      const m = customModelOf(modelId);
      if (!m || m.kind !== 'fence' || m.derivedFrom || !wantsGateFrame(m) || hasRealFrame(m, get().materials)) return modelId;
      const mat = suggestFrameMaterial(m, get().materials);
      return (mat && ensureFramedModel(modelId, mat.id)) || modelId;
    },
    setGateFrame(itemId, materialId, rot) {
      const cur = currentProject();
      if (!cur) return;
      // opseg izmene (samo ova kapija / sve kapije / sve): svaka kapija dobija istu cev oko svog modela
      const scope = get().editor.scope ?? 'one';
      const targets = new Set(scope === 'one' ? [itemId] : editScopeTargets(cur, itemId, scope));
      get().mutate((p) => ({
        ...p,
        items: p.items.map((it) => {
          if (!targets.has(it.id) || it.kind !== 'gate' || isTubesModel(it.infillModelId)) return it;
          const baseId = it.params.gateFrame?.baseId ?? customModelOf(it.infillModelId)?.derivedFrom ?? it.infillModelId;
          const base = customModelOf(baseId);
          if (!base) return it;
          const drawn = drawnFrameOf(base);
          // bez cevi, ili ista cev i čelo kao ram nacrtan u modelu: kapija koristi sam model
          if (!materialId || (drawn && drawn.materialId === materialId && (rot === undefined || rot === drawn.rot))) return { ...it, infillModelId: baseId as FenceModelId, params: { ...it.params, gateFrame: null } } as LayoutItem;
          const id = ensureFramedModel(baseId, materialId, rot);
          return id ? ({ ...it, infillModelId: id as FenceModelId, params: { ...it.params, gateFrame: { baseId, materialId, ...(rot !== undefined ? { rot } : {}) } } } as LayoutItem) : it;
        }),
      }), `gframe:${itemId}`);
    },
    setItemColor(id, color) { get().mutate((p) => changeColor(p, id, color)); },
    setItemFinish(id, finish) { get().mutate((p) => changeFinish(p, id, finish)); },
    setWidth(id, outerMm, key) {
      const cur = currentProject();
      if (!cur) return false;
      const problem = widthChangeProblem(cur, id, outerMm);
      if (problem) { get().setNotice(`Nije moguće: ${problem}`); return false; }
      get().mutate((p) => setOuterWidth(p, id, outerMm), key);
      return true;
    },
    setItemWidth(id, mm, mode, key) {
      const cur = currentProject();
      const src = cur?.items.find((i) => i.id === id);
      if (!cur || !src) return false;
      const scope = get().editor.scope ?? 'one';
      // samo elementi iste vrste (platna na platna, kapije na kapije); stepenište ima svoj raspon
      const ids = scope === 'one' ? [id] : editScopeTargets(cur, id, scope).filter((t) => {
        const it = cur.items.find((x) => x.id === t);
        return t === id || (!!it && it.kind === src.kind && !('stair' in it && it.stair));
      });
      const res = setItemsWidth(cur, ids.length ? ids : [id], mm, mode);
      if (res.problem) { get().setNotice(`Nije moguće: ${res.problem}`); return false; }
      get().mutate(() => res.project, key);
      return true;
    },

    upsertCustomer(c) {
      set((s) => ({ customers: s.customers.some((x) => x.id === c.id) ? s.customers.map((x) => (x.id === c.id ? c : x)) : [...s.customers, c] }));
    },
    removeCustomer(id) {
      set((s) => ({
        customers: s.customers.filter((x) => x.id !== id),
        projects: s.projects.map((p) => (p.customerId === id ? { ...p, customerId: null } : p)),
      }));
    },
    upsertMaterial(m) {
      // cev ili U profil pod zajedničkom cenom po kg: cena prati masu (i kad se masa ili presek promene)
      m = withKgPrice(withMaterialUnits(m), get().settings.kgPrice);
      set((s) => ({ materials: s.materials.some((x) => x.id === m.id) ? s.materials.map((x) => (x.id === m.id ? m : x)) : [...s.materials, m] }));
    },
    setMaterials(materials) { const kg = get().settings.kgPrice; set({ materials: materials.map((m) => withKgPrice(withMaterialUnits(m), kg)) }); },
    setKgPrice(kg) {
      get().updateSettings({ kgPrice: kg });
      if (kg) set((s) => ({ materials: s.materials.map((m) => withKgPrice(m, kg)) }));
    },
    removeMaterial(id) { set((s) => ({ materials: s.materials.filter((x) => x.id !== id) })); },
    updateSettings(patch) {
      set((s) => {
        const rate = patch.pricing?.coatingPerM2Rsd;
        const changed = rate !== undefined && rate !== (s.settings.pricing.coatingPerM2Rsd ?? 0);
        return {
          settings: { ...s.settings, ...patch },
          ...(changed ? { projects: s.projects.map((p) => ({ ...p, updatedAt: new Date().toISOString(), settings: { ...p.settings, pricing: { ...p.settings.pricing, coatingPerM2Rsd: rate } } })) } : {}),
        };
      });
    },
    startDorada(builtinId) {
      const id = uid('cm');
      const model = builtinToCustom(builtinId, get().materials, id);
      const customModels = [...(get().settings.customModels ?? []), model];
      registerCustomModels(customModels, get().materials);
      set((s) => ({ settings: { ...s.settings, customModels } }));
      return id;
    },
    replaceBuiltin(customId) {
      const list = get().settings.customModels ?? [];
      const m = list.find((x) => x.id === customId);
      const base = m?.baseModelId;
      if (!m || !base || !(base in FENCE_MODELS)) return;
      // samo jedan dorađen model zamenjuje isti model iz kataloga: prethodni postaje običan model, a njegovi projekti prelaze na novi
      const prev = list.find((x) => x.replaces === base && x.id !== customId);
      const customModels = list.map((x) => (x.id === customId ? { ...x, replaces: base, name: FENCE_MODELS[base as FenceModelId].name, updatedAt: new Date().toISOString() } : x.id === prev?.id ? { ...x, replaces: undefined } : x));
      registerCustomModels(customModels, get().materials);
      const from = new Set([base, ...(prev ? [prev.id] : [])]);
      set((s) => ({
        settings: { ...s.settings, customModels },
        projects: s.projects.map((p) => switchModel(p, from, customId)),
        editor: { ...s.editor, history: emptyHistory<Project>(), activeModelId: from.has(s.editor.activeModelId) ? (customId as FenceModelId) : s.editor.activeModelId },
      }));
    },
    restoreBuiltin(customId) {
      const list = get().settings.customModels ?? [];
      const m = list.find((x) => x.id === customId);
      const base = m?.replaces;
      if (!m || !base) return;
      const customModels = list.map((x) => (x.id === customId ? { ...x, replaces: undefined, name: `${FENCE_MODELS[base as FenceModelId]?.name ?? x.name} — dorada`, updatedAt: new Date().toISOString() } : x));
      registerCustomModels(customModels, get().materials);
      set((s) => ({
        settings: { ...s.settings, customModels },
        projects: s.projects.map((p) => switchModel(p, new Set([customId]), base)),
        editor: { ...s.editor, history: emptyHistory<Project>(), activeModelId: s.editor.activeModelId === customId ? (base as FenceModelId) : s.editor.activeModelId },
      }));
    },
    removeCustomModel(id) {
      // brisanje dorađenog modela koji zamenjuje original: projekti se vraćaju na original iz kataloga
      const gone = (get().settings.customModels ?? []).find((m) => m.id === id);
      // (dorađen crtež obrisanog originala iz kataloga se briše kao običan nacrtan model: original se ne vraća)
      if (gone?.replaces && !REMOVED_MODELS.has(gone.replaces)) get().restoreBuiltin(id);
      const customModels = (get().settings.customModels ?? []).filter((m) => m.id !== id);
      // katalog se osvežava pre izmene projekata, da nijedan prikaz ne zatekne element sa nepostojećim modelom
      registerCustomModels(customModels, get().materials);
      set((s) => ({
        settings: { ...s.settings, customModels },
        projects: s.projects.map(dropUnknownModels),
        editor: { ...s.editor, history: emptyHistory<Project>(), activeModelId: s.editor.activeModelId === id ? defaultModelId() : s.editor.activeModelId },
      }));
    },
    hideModel(id) {
      const hidden = [...new Set([...(get().settings.hiddenModels ?? []), id])];
      setHiddenModels(hidden);
      set((s) => ({ settings: { ...s.settings, hiddenModels: hidden } }));
    },
    restoreHiddenModels(prefix) {
      const hidden = prefix ? (get().settings.hiddenModels ?? []).filter((id) => !id.startsWith(prefix)) : [];
      setHiddenModels(hidden);
      set((s) => ({ settings: { ...s.settings, hiddenModels: hidden } }));
    },
    applyGateModel(itemId, modelId) {
      const m = (get().settings.customModels ?? []).find((x) => x.id === modelId);
      if (!m || !currentProject()) return false;
      get().mutate((p) => {
        const g0 = p.items.find((x) => x.id === itemId);
        // ograda i boja pre primene modela (ako kapija već ima model, ostaje prvobitno stanje): povratak na običnu kapiju ih vraća
        // pamti se i nacrtan ili dorađen model ograde; ne pamti se samo drugi model kapije
        const isGateModel = (id: string) => (get().settings.customModels ?? []).some((x) => x.id === id && x.kind === 'gate');
        const prev = g0 && g0.kind === 'gate' ? g0.design?.template?.prev ?? (g0.infillModelId in FENCE_MODELS && !isGateModel(g0.infillModelId) ? { infillModelId: g0.infillModelId, color: g0.color } : undefined) : undefined;
        const fields = gateFieldsFromModel(m);
        const q = updateItem(p, itemId, { ...fields, infillModelId: m.id as FenceModelId, ...(fields.design && prev ? { design: { ...fields.design, template: { ...fields.design.template!, prev } } } : {}) } as Partial<Gate>);
        // stubovi kapije se postavljaju PRE širine: spoljna širina se računa sa stubovima koji stvarno ostaju uz kapiju (inače kapija gubi razliku širina stubova)
        const withPosts = withModelPosts(q, itemId, m.gate);
        return setOuterWidth(withPosts, itemId, gateClearWidth(m) + 2 * postHalfSum(withPosts, indexOfItem(withPosts, itemId)));
      });
      return true;
    },
    applyBasicGate(itemId, fenceId) {
      const cur = currentProject();
      const g = cur?.items.find((i) => i.id === itemId);
      if (!cur || !g || g.kind !== 'gate') return;
      const list = get().settings.customModels;
      // samo modeli sa stranice „Modeli ograda“ (iz kataloga, dorađeni i nacrtani); model kapije i obrisan model se ne vraćaju.
      // Model iz kataloga koji je dorađen vodi na svoj dorađen crtež.
      const listed = (id?: string): FenceModelId | undefined => { if (!id) return undefined; const e = effectiveModelId(id); return e in FENCE_MODELS && isListedModel(e) ? (e as FenceModelId) : undefined; };
      // tip kapije je samo drugačije nacrtana kapija: ograda ostaje ona kojoj tip pripada (inače ona koju je kapija imala pre tipa),
      // pa ograda kapije, ograda ostalih elemenata projekta, ograda izabrana među modelima ograda i prvi model sa stranice Modeli ograda
      const prev = g.design?.template?.prev;
      const leaf = (list ?? []).find((x) => x.id === g.design?.template?.id)?.leafModelId;
      const otherModel = cur.items.map((x) => (x.id === itemId || x.kind === 'opening' ? undefined : listed(x.kind === 'fence' ? x.modelId : x.infillModelId))).find(Boolean);
      const fence: FenceModelId = listed(fenceId) ?? listed(leaf) ?? listed(prev?.infillModelId) ?? listed(g.infillModelId) ?? otherModel ?? listed(get().editor.activeModelId) ?? defaultModelId();
      const base = createGate(g.gateType, { infillModelId: fence, ...(!fenceId && prev?.color ? { color: prev.color } : {}) });
      get().mutate((p) => {
        let patch: Partial<Gate> = { infillModelId: base.infillModelId, color: base.color, heightMm: base.heightMm, opening: base.opening, swing: base.swing, lock: base.lock, hinge: base.hinge, automation: base.automation, automationType: base.automationType, unequalLeaves: false, leftLeafMm: 0, design: undefined, sliding: undefined, params: base.params };
        let width: number | null = null;
        if (g.gateType === 'sliding' && g.sliding) {
          const id = `${g.sliding.support === 'cantilever' ? 'samonoseca' : 'klizna_sina'}_${g.sliding.actuation === 'motor' ? 'motorna' : 'rucna'}` as import('../domain/gates/slidingAssembly').SlidingPresetId;
          const d = specFromPreset(id);
          patch = { ...patch, sliding: { ...d.spec, drawnLeaf: true, heightTotal: true }, heightMm: d.frameHeight + d.spec.frameBottomY, automation: d.spec.actuation === 'motor', automationType: 'sliding_motor' };
          width = d.frameWidth;
        }
        const q = updateItem(p, itemId, patch);
        return width !== null ? setOuterWidth(q, itemId, width + 2 * postHalfSum(q, indexOfItem(q, itemId))) : q;
      });
    },
    addGateFromModel(modelId, index) {
      const m = (get().settings.customModels ?? []).find((x) => x.id === modelId);
      const cur = currentProject();
      if (!m || !cur) return null;
      // tip kapije važi samo uz svoju ogradu: u projektu sa drugom ogradom se ne dodaje
      const fence = projectModelId(cur.items);
      if (fence && m.leafModelId && leafKeyOf(fence, get().settings.customModels) !== m.leafModelId) {
        get().setNotice(`Tip kapije „${m.name}“ je za drugu ogradu. U ovom projektu se koristi ${FENCE_MODELS[fence]?.name ?? 'druga ograda'}.`);
        return null;
      }
      const id = get().addElement({ kind: 'gate', gateType: m.gate?.gateType ?? 'pedestrian', modelId: m.id as FenceModelId }, index);
      if (!id) return null;
      get().applyGateModel(id, modelId);
      return id;
    },
    setGateModelDefault(modelId, on) {
      const list = get().settings.customModels ?? [];
      const m = list.find((x) => x.id === modelId);
      if (!m) return;
      // jedna podrazumevana kapija po tipu i ogradi: ostale istog tipa za istu ogradu gube oznaku
      const customModels = list.map((x) => (x.id === modelId ? { ...x, gateDefault: on || undefined }
        : on && x.kind === 'gate' && x.gate?.gateType === m.gate?.gateType && x.leafModelId === m.leafModelId && x.gate?.sliding?.support === m.gate?.sliding?.support ? { ...x, gateDefault: undefined } : x));
      set((s) => ({ settings: { ...s.settings, customModels } }));
    },
    startGateDorada(gateType, fenceModelId) {
      const id = uid('cm');
      const wide = gateType === 'double' || gateType === 'sliding';
      const fence = fenceModelId ?? defaultModelId();
      // dvokrilna: dva odvojena krila u jednom crtežu sa svim okovom (šarke, brava, prihvatnik, podni zasun i prihvat)
      if (gateType === 'double') {
        const pair = doubleGateSeed(fence, get().settings.customModels, get().materials, id, 3000, 1500);
        if (!('error' in pair)) {
          const gate = { ...defaultGateConfig('double'), clearWidthMm: pairWidth(pair.layout), leaves: pair.layout, unequalLeaves: false, leftLeafMm: 0, opening: 'left' as const, design: { ...defaultGateConfig('double').design, activeLeaf: 'left' as const } };
          const model = { ...pair.model, draft: true, name: GATE_TYPE_LABELS.double, kind: 'gate' as const, baseModelId: undefined, leafModelId: leafKey(fence, get().settings.customModels), gate };
          if (pair.missing.length) { try { sessionStorage.setItem(`dorada.missing.${id}`, pair.missing.join(', ')); } catch { /* bez sessionStorage-a */ } }
          const customModels = [...(get().settings.customModels ?? []), model];
          registerCustomModels(customModels, get().materials);
          set((s) => ({ settings: { ...s.settings, customModels } }));
          return id;
        }
      }
      // pešačka i jednokrilna: šarke i brava su nacrtani na crtežu
      if (gateType === 'pedestrian' || gateType === 'single') {
        const one = singleGateSeed(fence, get().settings.customModels, get().materials, id, 1000, 1500);
        if (!('error' in one)) {
          if (one.missing.length) { try { sessionStorage.setItem(`dorada.missing.${id}`, one.missing.join(', ')); } catch { /* bez sessionStorage-a */ } }
          const gate = { ...defaultGateConfig(gateType), clearWidthMm: 1000, hwDrawn: true };
          const model = { ...one.model, draft: true, name: GATE_TYPE_LABELS[gateType], kind: 'gate' as const, baseModelId: undefined, leafModelId: leafKey(fence, get().settings.customModels), gate };
          const customModels = [...(get().settings.customModels ?? []), model];
          registerCustomModels(customModels, get().materials);
          set((s) => ({ settings: { ...s.settings, customModels } }));
          return id;
        }
      }
      const seed = leafSeed(fence, get().settings.customModels, get().materials, id, wide ? 3000 : 1000, 1500);
      const base = 'error' in seed ? builtinToCustom(defaultModelId(), get().materials, id, wide ? 3000 : 1000, 1500) : seed;
      const model = { ...base, draft: true, name: GATE_TYPE_LABELS[gateType], kind: 'gate' as const, baseModelId: undefined, leafModelId: 'error' in seed ? undefined : leafKey(fence, get().settings.customModels), gate: { ...defaultGateConfig(gateType), clearWidthMm: wide ? 3000 : 1000 } };
      const customModels = [...(get().settings.customModels ?? []), model];
      registerCustomModels(customModels, get().materials);
      set((s) => ({ settings: { ...s.settings, customModels } }));
      return id;
    },
    newProjectFromGateModel(modelId) {
      const m = (get().settings.customModels ?? []).find((x) => x.id === modelId);
      if (!m || !(m.id in FENCE_MODELS)) return null;
      let p = createProject(`Novi projekat — ${m.name}`, [createGate(m.gate?.gateType ?? 'pedestrian', { infillModelId: m.id as FenceModelId })]);
      p.quoteNo = nextQuoteNo(get().projects);
      p.settings.pricing = { ...get().settings.pricing };
      const gate = p.items[0] as Gate;
      p = updateItem(p, gate.id, gateFieldsFromModel(m) as Partial<Gate>);
      p = withModelPosts(p, gate.id, m.gate);
      p = setOuterWidth(p, gate.id, gateClearWidth(m) + 2 * postHalfSum(p, 0));
      p = withGateFrames(p);
      set((s) => ({ projects: [p, ...s.projects], editor: { ...emptyEditor(), projectId: p.id, activeModelId: s.editor.activeModelId } }));
      rememberProject(p.id);
      return p.id;
    },
    createGateDraft(modelId) {
      const m = (get().settings.customModels ?? []).find((x) => x.id === modelId);
      if (!m || !(m.id in FENCE_MODELS)) return null;
      let p = createProject('Mere kapije', [createGate(m.gate?.gateType ?? 'pedestrian', { infillModelId: m.id as FenceModelId })]);
      p.modelDraft = { modelId: m.id };
      p.settings.pricing = { ...get().settings.pricing };
      const gate = p.items[0] as Gate;
      p = updateItem(p, gate.id, gateFieldsFromModel(m) as Partial<Gate>);
      p = withModelPosts(p, gate.id, m.gate);
      p = setOuterWidth(p, gate.id, gateClearWidth(m) + 2 * postHalfSum(p, 0));
      DRAFT_PREV.set(p.id, get().editor.projectId);
      set((s) => ({ projects: [p, ...s.projects], editor: { ...emptyEditor(), projectId: p.id, activeModelId: s.editor.activeModelId } }));
      return { projectId: p.id, itemId: gate.id };
    },
    addSlidingGate(source) {
      const cur = currentProject();
      if (!cur) return null;
      // krilo je izabrani model ograde (menja se kao kod ostalih kapija); sklop daje klizni okov
      // visina kapije je ukupna visina od tla: visina krila + odstojanje donje ivice rama
      const d = specFromPreset(source.preset);
      const spec: SlidingSpec = { ...d.spec, drawnLeaf: true, heightTotal: true };
      const frameWidth = d.frameWidth; const heightMm = d.frameHeight + d.spec.frameBottomY; const opening: Gate['opening'] = 'right';
      const id = get().addElement({ kind: 'gate', gateType: 'sliding' });
      if (!id) return null;
      get().mutate((p) => {
        const q = updateItem(p, id, { sliding: spec, heightMm, opening, automation: spec.actuation === 'motor', automationType: 'sliding_motor' } as Partial<Gate>);
        return setOuterWidth(q, id, frameWidth + 2 * postHalfSum(q, indexOfItem(q, id)));
      });
      return id;
    },
    patchSliding(itemId, patch, key) {
      const cur = currentProject();
      const g = cur?.items.find((i) => i.id === itemId);
      if (!g || g.kind !== 'gate' || !g.sliding) return;
      const next = { ...g.sliding, ...patch };
      get().mutate((p) => updateItem(p, itemId, { sliding: next, automation: next.actuation === 'motor' } as Partial<Gate>), key ? `sl:${key}:${itemId}` : null);
    },
    setTailSel(itemId, key) {
      set((s) => ({ editor: { ...s.editor, tailSel: { ...(s.editor.tailSel ?? {}), [itemId]: key } } }));
    },
    setSlideTest(itemId, pct) {
      set((s) => ({ editor: { ...s.editor, slideTest: { ...s.editor.slideTest, [itemId]: Math.max(0, Math.min(100, pct)) } } }));
    },
    startSlidingDorada(presetId, fenceModelId) {
      const id = uid('cm');
      const d = specFromPreset(presetId);
      const fence = fenceModelId ?? defaultModelId();
      const seed = leafSeed(fence, get().settings.customModels, get().materials, id, d.frameWidth, d.frameHeight);
      const base = 'error' in seed ? builtinToCustom(defaultModelId(), get().materials, id, d.frameWidth, d.frameHeight) : seed;
      const sliding = slidingForModel(presetId, true);
      const model = { ...base, draft: true, name: presetTitle(presetId), kind: 'gate' as const, baseModelId: undefined, leafModelId: 'error' in seed ? undefined : leafKey(fence, get().settings.customModels), gate: { ...defaultGateConfig('sliding'), automation: sliding.actuation === 'motor', sliding } };
      const customModels = [...(get().settings.customModels ?? []), model];
      registerCustomModels(customModels, get().materials);
      set((s) => ({ settings: { ...s.settings, customModels } }));
      return id;
    },
    newProjectFromSliding(source) {
      const pid = get().newProject({ name: 'Novi projekat — klizna kapija' });
      const id = get().addSlidingGate(source);
      if (!id) { get().removeProject(pid); return null; }
      return pid;
    },
    upsertPostTemplate(t) {
      set((s) => {
        const list = s.settings.postTemplates ?? [];
        return { settings: { ...s.settings, postTemplates: list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t] } };
      });
    },
    removePostTemplate(id) {
      set((s) => ({ settings: { ...s.settings, postTemplates: (s.settings.postTemplates ?? []).filter((t) => t.id !== id) } }));
    },
    applyPostTemplate(templateId, postIds) {
      const t = (get().settings.postTemplates ?? []).find((x) => x.id === templateId);
      if (!t || !postIds.length) return;
      get().mutate((p) => applyPostTemplateTo(p, postIds, t), null);
    },
    finishGateDraft(projectId, version) {
      const proj = get().projects.find((x) => x.id === projectId);
      const index = proj ? proj.items.findIndex((i) => i.kind === 'gate') : -1;
      const g = proj?.items[index];
      const cfg = proj && g && g.kind === 'gate' ? gateConfigFromGate(g, computeLayout(proj).items[index].clearWidth, version, postDimsOf(proj.posts[index], proj.posts[index + 1])) : null;
      const prev = DRAFT_PREV.get(projectId) ?? null;
      DRAFT_PREV.delete(projectId);
      set((s) => ({ projects: s.projects.filter((x) => x.id !== projectId), editor: { ...emptyEditor(), projectId: prev && s.projects.some((x) => x.id === prev) ? prev : null, activeModelId: s.editor.activeModelId } }));
      return cfg;
    },
  };
});

// katalog prati nacrtane modele i cenovnik (pretplata na nivou modula se izvršava pre osvežavanja komponenti)
useAppStore.subscribe((s, prev) => {
  if (s.settings.customModels !== prev.settings.customModels || s.settings.terraceModelIds !== prev.settings.terraceModelIds || s.materials !== prev.materials) registerCustomModels(s.settings.customModels, s.materials, s.settings.terraceModelIds ?? []);
  if (s.settings.hiddenModels !== prev.settings.hiddenModels) setHiddenModels(s.settings.hiddenModels);
  // stubovi ograda za terase po ravnoj liniji ograde: iznova kad se promeni crtež modela, cenovnik ili se podaci učitaju
  if (s.settings.customModels !== prev.settings.customModels || s.materials !== prev.materials || s.projects !== prev.projects || (s.ready && !prev.ready)) {
    const fixed = s.projects.map((p) => withRunPosts(mergeTerraceRuns(p).project, s.materials));
    if (fixed.some((p, i) => p !== s.projects[i])) useAppStore.setState({ projects: fixed });
  }
  // izabrani model koji nije na stranici Modeli ograda (obrisan, sakriv ili zamenjen) menja se: izabran u ovoj sesiji, inače prvi sa stranice
  if (s.settings.customModels !== prev.settings.customModels || s.settings.hiddenModels !== prev.settings.hiddenModels || s.ready !== prev.ready) {
    // posle osvežavanja stranice važi model izabran u ovoj sesiji
    const next = (s.ready && !prev.ready ? sessionModel() : null) ?? (isListedModel(s.editor.activeModelId) ? s.editor.activeModelId : sessionModel() ?? firstListedModel());
    if (next !== s.editor.activeModelId) useAppStore.setState({ editor: { ...s.editor, activeModelId: next } });
  }
  // magacin prati status projekta: „U izradi“ / „Završeno“ = materijal iz krojne liste je proknjižen (jednom), povratak na „Nacrt“ / „Ponuda“ ga povlači
  if (s.projects !== prev.projects) {
    const before = new Map(prev.projects.map((p) => [p.id, p]));
    const changed = s.projects.filter((p) => !p.modelDraft && before.has(p.id) && isStockStatus(before.get(p.id)!.status) !== isStockStatus(p.status));
    // projekat sa proknjiženim sečenjem („U izradi“ ili potvrđeno dugmetom) kome se promene ostaci: knjiženje se povlači i ponovo radi
    // (novi komad iz magacina se skida, uklonjen se vraća); projekat kome je status upravo promenjen rešava petlja ispod
    const reoffcut = s.projects.filter((p) => !p.modelDraft && before.has(p.id) && !changed.includes(p) && before.get(p.id)!.offcuts !== p.offcuts && s.settings.stockBookings?.[p.id]);
    if (changed.length || reoffcut.length) {
      let settings = s.settings;
      for (const p of reoffcut) {
        const stock = unbookProjectStock(settings.stock ?? [], settings.stockBookings![p.id]);
        const r = bookProjectStock(p, { ...settings, stock }, s.materials);
        settings = { ...settings, stock: r.stock, stockBookings: { ...settings.stockBookings, [p.id]: r.record } };
      }
      for (const p of changed) {
        const bookings = { ...(settings.stockBookings ?? {}) };
        const legacy = settings.stockBooked ?? [];
        if (isStockStatus(p.status)) {
          if (bookings[p.id] || legacy.includes(p.id)) continue;
          const r = bookProjectStock(p, settings, s.materials);
          settings = { ...settings, stock: r.stock, stockBookings: { ...bookings, [p.id]: r.record } };
        } else {
          const rec = bookings[p.id];
          delete bookings[p.id];
          settings = { ...settings, stock: rec ? unbookProjectStock(settings.stock ?? [], rec) : settings.stock, stockBookings: bookings, ...(legacy.includes(p.id) ? { stockBooked: legacy.filter((x) => x !== p.id) } : {}) };
        }
      }
      if (settings !== s.settings) useAppStore.setState({ settings });
    }
  }
});

export const useCurrentProject = (): Project | undefined =>
  useAppStore((s) => (s.editor.projectId ? s.projects.find((p) => p.id === s.editor.projectId) : undefined));

/** projekti za spiskove: privremeni projekti za uređivanje modela kapije se ne prikazuju */
export function useListedProjects(): Project[] {
  const projects = useAppStore((s) => s.projects);
  return useMemo(() => projects.filter((p) => !p.modelDraft), [projects]);
}
