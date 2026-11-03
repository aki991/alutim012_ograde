import { create } from 'zustand';
import { SEED_MATERIALS } from '../data/materials';
import { createSeedData } from '../data/seed';
import { loadAll, saveAll, wipeAll } from '../db';
import {
  changeColor, changeModelAll, duplicateItem, indexOfItem, insertItem, moveItemBy, removeItem, setOuterWidth, withConcretePosts, updateItem, updateItemParams, updatePost,
} from '../domain/geometry/operations';
import { postHalfSum } from '../domain/geometry/layout';
import { DEFAULT_MODEL_ID, FENCE_MODELS, TERRACE_NO_GATES, isTerraceModel } from '../domain/models/catalog';
import { createFence, createGate, createCorner, createOpening, createProject, nowIso } from '../domain/models/factories';
import { emptyHistory, recordChange, redo as redoH, undo as undoH, type History } from '../domain/models/history';
import type {
  AppSettings, Customer, FenceModelId, FenceSection, Gate, GateType, LayoutItem, Material, Post, Project,
} from '../domain/models/types';
import { migrateProject } from '../domain/validation/project';
import { uid } from '../utils/id';

export type SaveStatus = 'saved' | 'saving' | 'error';
export type Selection = { type: 'item' | 'post'; id: string } | null;
export type EditorView = 'front' | 'top' | 'three' | 'split' | 'dims' | 'bom' | 'photo';

export type NewElementSpec =
  | { kind: 'fence'; modelId: FenceModelId }
  | { kind: 'gate'; gateType: GateType; modelId?: FenceModelId; /** kapija između betonskih stubova */ concrete?: boolean }
  | { kind: 'opening' }
  | { kind: 'corner' };

interface EditorState {
  projectId: string | null;
  selection: Selection;
  /** više izabranih polja (Ctrl+klik, okvir): ID-evi svih izabranih elemenata kad ih je dva ili više; inače prazno */
  multi: string[];
  history: History<Project>;
  view: EditorView;
  /** 1 = 100% (0,1 px po mm) */
  zoom: number;
  activeModelId: FenceModelId;
  /** Poslednja poruka (upozorenje) koju editor prikazuje korisniku */
  notice: string | null;
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

  upsertCustomer: (c: Customer) => void;
  removeCustomer: (id: string) => void;
  upsertMaterial: (m: Material) => void;
  setMaterials: (list: Material[]) => void;
  removeMaterial: (id: string) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
}

const emptyEditor = (): EditorState => ({
  projectId: null, selection: null, multi: [], history: emptyHistory<Project>(), view: 'front', zoom: 1, activeModelId: DEFAULT_MODEL_ID, notice: null,
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

const seed = createSeedData();

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
          const s = createSeedData();
          await saveAll(s);
          set({ ...s, ready: true });
        } else {
          set({ projects: data.projects.map(migrateProject), customers: data.customers, materials: [...data.materials, ...SEED_MATERIALS.filter((m) => !data.materials.some((x) => x.id === m.id))], settings: data.settings ?? seed.settings, ready: true });
        }
      } catch (e) {
        // IndexedDB nedostupan (npr. privatni režim): radimo u memoriji i jasno prijavljujemo grešku
        const s = createSeedData();
        set({ ...s, ready: true, loadError: `Lokalna baza nije dostupna: ${(e as Error).message}. Podaci neće biti sačuvani.`, saveStatus: 'error' });
      }
    },

    async resetDemo() {
      await wipeAll();
      const s = createSeedData();
      await saveAll(s);
      set({ ...s, editor: emptyEditor(), saveStatus: 'saved', saveError: null });
    },

    setSaveStatus(status, err = null) {
      set({ saveStatus: status, saveError: err });
    },

    newProject(opts = {}) {
      const items: LayoutItem[] = [];
      if (opts.modelId) items.push(createFence({ modelId: opts.modelId }));
      if (opts.startGate && !isTerraceModel(opts.modelId ?? DEFAULT_MODEL_ID)) items.push(createGate(opts.startGate, { infillModelId: opts.modelId ?? DEFAULT_MODEL_ID }));
      const p = createProject(opts.name ?? 'Novi projekat', items, opts.customerId ?? null);
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
      set((s) => ({ editor: { ...s.editor, projectId: id, selection: null, multi: [], history: emptyHistory<Project>(), notice: null } }));
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

    select(selection) { set((s) => ({ editor: { ...s.editor, selection, multi: [] } })); },
    toggleItem(id) {
      const { selection, multi } = get().editor;
      const current = multi.length > 1 ? multi : selection?.type === 'item' ? [selection.id] : [];
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      set((s) => ({ editor: { ...s.editor, multi: next.length > 1 ? next : [], selection: next.length ? { type: 'item', id: next[next.length - 1] } : null } }));
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
      const modelId = get().editor.activeModelId;
      const fenceDef = spec.kind === 'fence' && spec.modelId ? FENCE_MODELS[spec.modelId] : undefined;
      const height = fenceDef?.defaultSize?.heightMm ?? cur.settings.defaultHeightMm;
      if (spec.kind === 'gate' && isTerraceModel(spec.modelId ?? modelId)) { get().setNotice(TERRACE_NO_GATES); return null; }
      let item: LayoutItem;
      if (spec.kind === 'fence') item = createFence({ modelId: spec.modelId, heightMm: height });
      else if (spec.kind === 'gate') item = createGate(spec.gateType, { heightMm: height, infillModelId: spec.modelId ?? modelId });
      else if (spec.kind === 'corner') item = createCorner({ heightMm: height });
      else item = createOpening({ heightMm: height });
      get().mutate((p) => {
        const q = insertItem(p, item, index ?? p.items.length);
        // model sa zadatom veličinom (tarabica): zadaje se svetli otvor, pa je spoljna širina otvor + stubovi
        const outer = fenceDef?.defaultSize ? fenceDef.defaultSize.clearWidthMm + 2 * postHalfSum(q, indexOfItem(q, item.id)) : item.widthMm;
        return setOuterWidth(spec.kind === 'gate' && spec.concrete ? withConcretePosts(q, item.id) : q, item.id, outer);
      });
      set((s) => ({ editor: { ...s.editor, selection: { type: 'item', id: item.id }, multi: [] } }));
      return item.id;
    },

    deleteSelected() {
      const { selection: sel, multi } = get().editor;
      if (!sel || sel.type !== 'item') return;
      const ids = multi.length > 1 ? multi : [sel.id];
      get().mutate((p) => ids.reduce((q, id) => removeItem(q, id), p));
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
  };
});

export const useCurrentProject = (): Project | undefined =>
  useAppStore((s) => (s.editor.projectId ? s.projects.find((p) => p.id === s.editor.projectId) : undefined));
