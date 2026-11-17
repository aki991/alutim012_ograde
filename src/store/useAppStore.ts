import { useMemo } from 'react';
import { create } from 'zustand';
import { isBuiltinMaterial } from '../data/materials';
import { DEFAULT_CARRIAGES, DEFAULT_PLATES, DEFAULT_RAILS, missingModelMaterials } from '../data/modelMaterials';
import { withTerraceMaterials } from '../data/terraceMaterials';
import { createSeedData } from '../data/seed';
import { loadAll, saveAll, wipeAll } from '../db';
import {
  changeColor, changeFinish, changeModelAll, widthChangeProblem, duplicateItem, indexOfItem, insertItem, moveItemBy, setOuterWidth, withConcretePosts, updateItem, updateItemParams, updatePost,
} from '../domain/geometry/operations';
import { newItemFor } from '../domain/geometry/newItem';
import { computeLayout } from '../domain/geometry/layout';
import { removeStair, setStairGroup } from '../domain/geometry/stairOps';
import { DEFAULT_MODEL_ID, FENCE_MODELS, TERRACE_NO_GATES, isTerraceModel, projectModelId } from '../domain/models/catalog';
import { effectiveModelId, registerCustomModels, setHiddenModels } from '../domain/models/customRegistry';
import { presetTitle, slidingForModel, specFromPreset, type SlidingSpec } from '../domain/gates/slidingAssembly';
import { defaultGateConfig, gateClearWidth, gateConfigFromGate, gateFieldsFromModel, GATE_TYPE_LABELS, postDimsOf, withModelPosts } from '../domain/gates/gateModels';
import { postHalfSum } from '../domain/geometry/layout';
import { builtinToCustom } from '../domain/models/fromBuiltin';
import { cleanMaterialName } from '../domain/models/materialTitle';
import { createFence, createGate, createProject, DEFAULT_FENCE_WIDTH_MM, nowIso } from '../domain/models/factories';
import { emptyHistory, recordChange, redo as redoH, undo as undoH, type History } from '../domain/models/history';
import type {
  AppSettings, Customer, FenceModelId, FenceSection, Gate, GateType, LayoutItem, Material, Post, Project, SlidingTemplate,
} from '../domain/models/types';
import { migrateProject } from '../domain/validation/project';
import { applyPostTemplate as applyPostTemplateTo } from '../domain/models/postTemplates';
import { bookProjectStock } from '../domain/pricing/stockBooking';
import { uid } from '../utils/id';

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
  | { kind: 'fence'; modelId: FenceModelId; /** polje stepeništa (samo ograde za terase) */ stair?: boolean }
  | { kind: 'gate'; gateType: GateType; modelId?: FenceModelId; /** kapija između betonskih stubova */ concrete?: boolean }
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
  duplicateSelected: () => void;
  moveSelected: (delta: -1 | 1) => void;
  patchItem: (id: string, patch: Partial<FenceSection> | Partial<Gate> | { widthMm?: number; heightMm?: number; bendDeg?: number }, key?: string) => void;
  patchItemParams: (id: string, patch: Partial<FenceSection['params']>, key?: string) => void;
  patchPost: (id: string, patch: Partial<Post>, key?: string) => void;
  setItemModel: (id: string, modelId: FenceModelId) => void;
  setItemColor: (id: string, color: string) => void;
  setItemFinish: (id: string, finish: import('../domain/models/types').Finish | undefined) => void;
  /** zadaje spoljnu širinu platna; sa zaključanom ukupnom dužinom se ostala platna prilagođavaju, a ako ne može — obaveštenje i bez izmene */
  setWidth: (id: string, outerMm: number, key?: string) => boolean;

  upsertCustomer: (c: Customer) => void;
  removeCustomer: (id: string) => void;
  upsertMaterial: (m: Material) => void;
  setMaterials: (list: Material[]) => void;
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
  restoreHiddenModels: () => void;
  /** modeli kapija = nacrtani modeli vrste „Kapija“ sa podešavanjima iz „Mere kapije“ */
  /** postavlja kapiju u otvorenom projektu prema modelu (ispuna, boja, visina, tip, mere, okovi); svetli otvor je onaj iz modela */
  applyGateModel: (itemId: string, modelId: string) => boolean;
  /** dodaje kapiju iz modela na kraj niza u otvorenom projektu; vraća ID kapije */
  addGateFromModel: (modelId: string) => string | null;
  /** dorada osnovne kapije: pravi crtež kapije od delova podrazumevanog modela kao nov model vrste „Kapija“ i vraća njegov ID */
  startGateDorada: (gateType: GateType) => string;
  /** nov projekat sa jednom kapijom iz modela; vraća ID projekta */
  newProjectFromGateModel: (modelId: string) => string | null;
  /** privremen projekat sa kapijom iz modela, otvoren u „Mere kapije“ unutar crtanja modela; vraća ID projekta i kapije */
  createGateDraft: (modelId: string) => { projectId: string; itemId: string } | null;
  /** zatvara privremen projekat: vraća podešavanja kapije (sa zadatom verzijom) i briše projekat */
  finishGateDraft: (projectId: string, version: number) => import('../domain/gates/gateModels').GateConfig | null;
  /** klizna kapija kao sklop: dodaje varijantu (preset iz JSON-a) ili korisnički šablon na kraj niza; vraća ID kapije */
  addSlidingGate: (source: { preset: import('../domain/gates/slidingAssembly').SlidingPresetId } | { template: string }) => string | null;
  /** izmena sklopa klizne kapije (oslonac, pogon, hod, pozicije …) */
  patchSliding: (itemId: string, patch: Partial<import('../domain/gates/slidingAssembly').SlidingSpec>, key?: string) => void;
  /** proba hoda (0–100 %): pomera samo pokretne delove na crtežu */
  setSlideTest: (itemId: string, pct: number) => void;
  /** izbor jedne cevi repa (null = bez izbora) */
  setTailSel: (itemId: string, key: string | null) => void;
  /** čuva kliznu kapiju kao imenovan šablon (nezavisna kopija); vraća ID šablona */
  saveSlidingTemplate: (itemId: string, name: string) => string | null;
  removeSlidingTemplate: (id: string) => void;
  /** dodaje ili menja šablon stuba (Podešavanja → Šabloni stubova) */
  upsertPostTemplate: (t: import('../domain/models/types').PostTemplate) => void;
  removePostTemplate: (id: string) => void;
  /** primenjuje šablon stuba na stubove aktivnog projekta (jedna izmena u istoriji) */
  applyPostTemplate: (templateId: string, postIds: string[]) => void;
  /** Doradi: nov model klizne kapije iz polazne varijante (nezavisna kopija koja se menja u crtežu modela) */
  startSlidingDorada: (presetId: import('../domain/gates/slidingAssembly').SlidingPresetId) => string;
  /** izmena modela klizne kapije; projekti koji su ga već koristili imaju svoju kopiju i ne menjaju se */
  /** nov projekat sa kliznom kapijom iz polazne varijante ili iz modela */
  newProjectFromSliding: (source: { preset: import('../domain/gates/slidingAssembly').SlidingPresetId } | { template: string }) => string | null;
}

/** Element čiji model više ne postoji (obrisan nacrtani model) prelazi na podrazumevani model, da se projekat i dalje otvara. */
export const dropUnknownModels = (p: Project): Project => {
  const known = (id: string) => id in FENCE_MODELS;
  if (p.items.every((it) => it.kind === 'opening' || known(it.kind === 'fence' ? it.modelId : it.infillModelId))) return p;
  const d = FENCE_MODELS[DEFAULT_MODEL_ID];
  return {
    ...p,
    items: p.items.map((it) => {
      if (it.kind === 'fence' && !known(it.modelId)) return { ...it, modelId: DEFAULT_MODEL_ID, materialId: d.materialId, params: { ...d.defaults } };
      if (it.kind === 'gate' && !known(it.infillModelId)) return { ...it, infillModelId: DEFAULT_MODEL_ID, params: { ...d.defaults } };
      return it;
    }),
  };
};

const emptyEditor = (): EditorState => ({
  projectId: null, selection: null, multi: [], multiPosts: [], history: emptyHistory<Project>(), view: 'front', zoom: 1, activeModelId: DEFAULT_MODEL_ID, notice: null, slideTest: {},
});

/** Izbor više polja ostaje samo za elemente koji i dalje postoje; sa manje od dva izabrana nema višestrukog izbora. */
const keepMulti = (multi: string[], p: Project): string[] => {
  const left = multi.filter((id) => p.items.some((i) => i.id === id));
  return left.length > 1 ? left : [];
};

/** Selekcija se zadržava posle undo/redo ako element i dalje postoji u projektu. */
const keepSelection = (sel: Selection, p: Project): Selection => {
  if (!sel) return null;
  const exists = sel.type === 'item' ? p.items.some((i) => i.id === sel.id) : p.posts.some((x) => x.id === sel.id);
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
const freshSeed = () => ({ ...createSeedData(), projects: [] as Project[] });

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
          const settings = data.settings ?? seed.settings;
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
          // nacrtani modeli moraju biti u katalogu pre nego što se projekti učitaju
          registerCustomModels(settings.customModels, materials);
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
          if (backfilled || renamed || carriagesAdded || terraceAdded || railAdded) {
            // autosave počinje tek posle init-a, pa se dodati materijali upisuju odmah; oznaka se postavlja tek kad je upis uspeo
            try {
              await saveAll({ projects: get().projects, customers: get().customers, materials, settings });
              if (backfilled) localStorage.setItem(BACKFILL_KEY, '1');
              if (renamed) localStorage.setItem(NAMES_KEY, '1');
              if (carriagesAdded) localStorage.setItem(CARRIAGES_KEY, '1');
              if (terraceAdded) localStorage.setItem(TERRACE_KEY, '1');
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
          const materials = mergeById(s.materials, patch.materials.upsert.filter((m) => !isBuiltinMaterial(m)), patch.materials.remove);
          if (materials !== s.materials) out.materials = materials;
        }
        if (patch.settings) out.settings = patch.settings;
        // modeli iz baze se registruju PRE provere projekata: inače bi projekat koji koristi nacrtani model (koji ovaj uređaj još nema) bio
        // vraćen na podrazumevani model, a prikaz bi pao na nepoznatom modelu i sinhronizacija bi stala sa greškom
        if (patch.settings || out.materials) registerCustomModels((out.settings ?? s.settings).customModels, out.materials ?? s.materials);
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
        if (!(ed.activeModelId in FENCE_MODELS)) out.editor = { ...ed, activeModelId: DEFAULT_MODEL_ID };
        return out;
      });
    },

    newProject(opts = {}) {
      // model iz kataloga koji je zamenjen dorađenim: koristi se dorađen
      if (opts.modelId) opts = { ...opts, modelId: effectiveModelId(opts.modelId) };
      const items: LayoutItem[] = [];
      if (opts.modelId) items.push(createFence({ modelId: opts.modelId }));
      if (opts.startGate && !isTerraceModel(opts.modelId ?? DEFAULT_MODEL_ID)) items.push(createGate(opts.startGate, { infillModelId: opts.modelId ?? DEFAULT_MODEL_ID }));
      let p = createProject(opts.name ?? 'Novi projekat', items, opts.customerId ?? null);
      // univerzalna početna mera platna: svetla širina 1500 mm (ograde za terase zadržavaju svoje mere)
      if (opts.modelId && !isTerraceModel(opts.modelId)) p = setOuterWidth(p, items[0].id, DEFAULT_FENCE_WIDTH_MM + 2 * postHalfSum(p, 0));
      p.quoteNo = nextQuoteNo(get().projects);
      p.settings.pricing = { ...get().settings.pricing };
      set((s) => ({
        projects: [p, ...s.projects],
        editor: { ...emptyEditor(), projectId: p.id, activeModelId: opts.modelId ?? s.editor.activeModelId },
      }));
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
      const next = fn(cur);
      if (next === cur) return;
      set((s) => {
        const selection = s.editor.selection;
        const stillThere =
          !selection ||
          (selection.type === 'item' ? next.items.some((i) => i.id === selection.id) : next.posts.some((x) => x.id === selection.id));
        return {
          projects: s.projects.map((p) => (p.id === cur.id ? next : p)),
          editor: { ...s.editor, history: recordChange(s.editor.history, cur, key), selection: stillThere ? selection : null, multi: keepMulti(s.editor.multi, next) },
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
    setActiveModel(activeModelId) { set((s) => ({ editor: { ...s.editor, activeModelId } })); },
    setNotice(notice) { set((s) => ({ editor: { ...s.editor, notice } })); },

    addElement(spec, index) {
      const cur = currentProject();
      if (!cur) return null;
      const modelId = projectModelId(cur.items) ?? get().editor.activeModelId; // projekat ima jedan model: novi element je istog modela
      if (spec.kind === 'gate' && isTerraceModel(spec.modelId ?? modelId)) { get().setNotice(TERRACE_NO_GATES); return null; }
      // novi element ima mere i izgled ograde koja je već u projektu (izabrano polje, inače poslednja ograda)
      const sel = get().editor.selection;
      const { item, outerWidthMm: outer, clearWidthMm } = newItemFor(cur, spec, modelId, sel?.type === 'item' ? sel.id : null);
      get().mutate((p) => {
        const q = insertItem(p, item, index ?? p.items.length);
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
      if (!sel || sel.type !== 'item') return;
      const ids = multi.length > 1 ? multi : [sel.id];
      // stepenište se briše ceo (sva polja između stubova)
      get().mutate((p) => ids.reduce((q, id) => (q.items.some((x) => x.id === id) ? removeStair(q, id) : q), p));
      set((s) => ({ editor: { ...s.editor, selection: null, multi: [] } }));
    },

    duplicateSelected() {
      const sel = get().editor.selection;
      const cur = currentProject();
      if (!sel || sel.type !== 'item' || !cur || get().editor.multi.length > 1) return;
      const { project, newId } = duplicateItem(cur, sel.id);
      get().mutate(() => project);
      if (newId) set((s) => ({ editor: { ...s.editor, selection: { type: 'item', id: newId }, multi: [] } }));
    },

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
      get().mutate((p) => changeModelAll(p, modelId)); set((s) => ({ editor: { ...s.editor, activeModelId: modelId } })); },
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
      set((s) => ({ materials: s.materials.some((x) => x.id === m.id) ? s.materials.map((x) => (x.id === m.id ? m : x)) : [...s.materials, m] }));
    },
    setMaterials(materials) { set({ materials }); },
    removeMaterial(id) { set((s) => ({ materials: s.materials.filter((x) => x.id !== id) })); },
    updateSettings(patch) { set((s) => ({ settings: { ...s.settings, ...patch } })); },
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
      if (gone?.replaces) get().restoreBuiltin(id);
      const customModels = (get().settings.customModels ?? []).filter((m) => m.id !== id);
      // katalog se osvežava pre izmene projekata, da nijedan prikaz ne zatekne element sa nepostojećim modelom
      registerCustomModels(customModels, get().materials);
      set((s) => ({
        settings: { ...s.settings, customModels },
        projects: s.projects.map(dropUnknownModels),
        editor: { ...s.editor, history: emptyHistory<Project>(), activeModelId: s.editor.activeModelId === id ? DEFAULT_MODEL_ID : s.editor.activeModelId },
      }));
    },
    hideModel(id) {
      const hidden = [...new Set([...(get().settings.hiddenModels ?? []), id])];
      setHiddenModels(hidden);
      set((s) => ({ settings: { ...s.settings, hiddenModels: hidden } }));
    },
    restoreHiddenModels() {
      setHiddenModels([]);
      set((s) => ({ settings: { ...s.settings, hiddenModels: [] } }));
    },
    applyGateModel(itemId, modelId) {
      const m = (get().settings.customModels ?? []).find((x) => x.id === modelId);
      if (!m || !currentProject()) return false;
      get().mutate((p) => {
        const q = updateItem(p, itemId, gateFieldsFromModel(m) as Partial<Gate>);
        return withModelPosts(setOuterWidth(q, itemId, gateClearWidth(m) + 2 * postHalfSum(q, indexOfItem(q, itemId))), itemId, m.gate);
      });
      return true;
    },
    addGateFromModel(modelId) {
      const m = (get().settings.customModels ?? []).find((x) => x.id === modelId);
      if (!m || !currentProject()) return null;
      const id = get().addElement({ kind: 'gate', gateType: m.gate?.gateType ?? 'pedestrian', modelId: m.id as FenceModelId });
      if (!id) return null;
      get().applyGateModel(id, modelId);
      return id;
    },
    startGateDorada(gateType) {
      const id = uid('cm');
      const wide = gateType === 'double' || gateType === 'sliding';
      const base = builtinToCustom(DEFAULT_MODEL_ID, get().materials, id, wide ? 3000 : 1000, 1500);
      const model = { ...base, name: GATE_TYPE_LABELS[gateType], kind: 'gate' as const, baseModelId: undefined, gate: { ...defaultGateConfig(gateType), clearWidthMm: wide ? 3000 : 1000 } };
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
      p = setOuterWidth(p, gate.id, gateClearWidth(m) + 2 * postHalfSum(p, 0));
      p = withModelPosts(p, gate.id, m.gate);
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
      p = setOuterWidth(p, gate.id, gateClearWidth(m) + 2 * postHalfSum(p, 0));
      p = withModelPosts(p, gate.id, m.gate);
      DRAFT_PREV.set(p.id, get().editor.projectId);
      set((s) => ({ projects: [p, ...s.projects], editor: { ...emptyEditor(), projectId: p.id, activeModelId: s.editor.activeModelId } }));
      return { projectId: p.id, itemId: gate.id };
    },
    addSlidingGate(source) {
      const cur = currentProject();
      if (!cur) return null;
      let spec: SlidingSpec; let frameWidth: number; let heightMm: number; let opening: Gate['opening'] = 'right'; let color: string | undefined;
      if ('preset' in source) {
        const d = specFromPreset(source.preset);
        // krilo je izabrani model ograde (menja se kao kod ostalih kapija); sklop daje klizni okov
        // visina kapije je ukupna visina od tla: visina krila + odstojanje donje ivice rama
        spec = { ...d.spec, drawnLeaf: true, heightTotal: true }; frameWidth = d.frameWidth; heightMm = d.frameHeight + d.spec.frameBottomY;
      } else {
        const t = (get().settings.slidingTemplates ?? []).find((x) => x.id === source.template);
        if (!t) return null;
        // nezavisna kopija: kasnije izmene šablona ili ove kapije ne utiču jedna na drugu
        spec = { ...(JSON.parse(JSON.stringify(t.spec)) as SlidingSpec), ...(t.spec.drawnLeaf ? { heightTotal: true } : {}) }; frameWidth = t.frameWidth; heightMm = t.heightMm; opening = t.opening; color = t.color;
      }
      const id = get().addElement({ kind: 'gate', gateType: 'sliding' });
      if (!id) return null;
      get().mutate((p) => {
        const q = updateItem(p, id, { sliding: spec, heightMm, opening, automation: spec.actuation === 'motor', automationType: 'sliding_motor', ...(color ? { color } : {}) } as Partial<Gate>);
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
    saveSlidingTemplate(itemId, name) {
      const cur = currentProject();
      const index = cur ? cur.items.findIndex((i) => i.id === itemId) : -1;
      const g = cur?.items[index];
      if (!cur || !g || g.kind !== 'gate' || !g.sliding) return null;
      const clear = computeLayout(cur).items[index].clearWidth;
      const id = uid('slt');
      const nm = name.trim() || g.sliding.name;
      const spec = JSON.parse(JSON.stringify({ ...g.sliding, name: nm })) as SlidingSpec;
      const t: SlidingTemplate = { id, name: nm, createdAt: new Date().toISOString(), spec, frameWidth: Math.round(clear), heightMm: g.heightMm, opening: g.opening, color: g.color };
      set((s) => ({ settings: { ...s.settings, slidingTemplates: [...(s.settings.slidingTemplates ?? []), t] } }));
      return id;
    },
    startSlidingDorada(presetId) {
      const id = uid('cm');
      const d = specFromPreset(presetId);
      const base = builtinToCustom(DEFAULT_MODEL_ID, get().materials, id, d.frameWidth, d.frameHeight);
      const sliding = slidingForModel(presetId, true);
      const model = { ...base, name: presetTitle(presetId), kind: 'gate' as const, baseModelId: undefined, gate: { ...defaultGateConfig('sliding'), automation: sliding.actuation === 'motor', sliding } };
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
    removeSlidingTemplate(id) {
      set((s) => ({ settings: { ...s.settings, slidingTemplates: (s.settings.slidingTemplates ?? []).filter((t) => t.id !== id) } }));
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
  if (s.settings.customModels !== prev.settings.customModels || s.materials !== prev.materials) registerCustomModels(s.settings.customModels, s.materials);
  if (s.settings.hiddenModels !== prev.settings.hiddenModels) setHiddenModels(s.settings.hiddenModels);
  // projekat prešao u „U izradi“: materijal iz krojne liste se knjiži u magacin (jednom po projektu, i kad se status menja tamo-amo ili poništi)
  if (s.projects !== prev.projects) {
    const before = new Map(prev.projects.map((p) => [p.id, p.status]));
    const booked = s.settings.stockBooked ?? [];
    const toBook = s.projects.filter((p) => p.status === 'u_izradi' && !p.modelDraft && before.has(p.id) && before.get(p.id) !== 'u_izradi' && !booked.includes(p.id));
    if (toBook.length) {
      let settings = s.settings;
      for (const p of toBook) settings = { ...settings, stock: bookProjectStock(p, settings, s.materials).stock, stockBooked: [...(settings.stockBooked ?? []), p.id] };
      useAppStore.setState({ settings });
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
