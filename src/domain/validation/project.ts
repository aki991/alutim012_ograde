import { FENCE_MODELS, LEGACY_COLORS, LEGACY_MODEL_MAP, normalizeColorKey, RAL_COLORS } from '../models/catalog';
import { applyPostRoles, DEFAULT_PRICING } from '../models/factories';
import { SCHEMA_VERSION, type LayoutItem, type Post, type Project } from '../models/types';

export const EXPORT_APP_ID = 'alu-tim-012';

export function serializeProject(project: Project): string {
  return JSON.stringify({ app: EXPORT_APP_ID, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), project }, null, 2);
}

/**
 * Migracija starijih projekata (IndexedDB i JSON uvoz) na tekuću verziju šeme, bez gubitka podataka.
 * v1 → v2: prazan projekat više nema automatski stub; kapije dobijaju opciono polje availableSpaceMm.
 */
export function migrateProject(p: Project): Project {
  let out = p;
  if (out.items.length === 0 && out.posts.length > 0) out = { ...out, posts: [] };
  if (out.schemaVersion !== SCHEMA_VERSION) out = { ...out, schemaVersion: SCHEMA_VERSION };
  // v2 → v3: stari modeli ispune zamenjeni su novim kataloškim modelima
  if (out.items.some((it) => (it.kind === 'fence' && it.modelId in LEGACY_MODEL_MAP) || (it.kind === 'gate' && it.infillModelId in LEGACY_MODEL_MAP))) {
    out = {
      ...out,
      items: out.items.map((it) => {
        if (it.kind === 'fence' && it.modelId in LEGACY_MODEL_MAP) {
          const modelId = LEGACY_MODEL_MAP[it.modelId];
          return { ...it, modelId, materialId: FENCE_MODELS[modelId].materialId, params: { ...FENCE_MODELS[modelId].defaults } };
        }
        if (it.kind === 'gate' && it.infillModelId in LEGACY_MODEL_MAP) {
          const infillModelId = LEGACY_MODEL_MAP[it.infillModelId];
          return { ...it, infillModelId, params: { ...FENCE_MODELS[infillModelId].defaults } };
        }
        return it;
      }),
    };
  }
  // uske horizontalne letvice su sada kvadratne cevi 30 × 20 u U profilima 20 × 20: stare početne mere (80 / 30 / 40 i prelazne 20 / 6 / 20) se menjaju
  const oldHn = (p: { barSizeMm: number; gapMm: number; frameMm: number }) => (p.barSizeMm === 80 && p.gapMm === 30 && p.frameMm === 40) || (p.barSizeMm === 20 && p.gapMm === 6 && p.frameMm === 20);
  if (out.items.some((it) => (it.kind === 'fence' && it.modelId === 'h_narrow' && oldHn(it.params)) || (it.kind === 'gate' && it.infillModelId === 'h_narrow' && oldHn(it.params)))) {
    const nu = FENCE_MODELS.h_narrow.defaults;
    out = {
      ...out,
      items: out.items.map((it) => {
        if (it.kind === 'fence' && it.modelId === 'h_narrow' && oldHn(it.params)) return { ...it, materialId: FENCE_MODELS.h_narrow.materialId, params: { ...it.params, ...nu, hn: undefined } };
        if (it.kind === 'gate' && it.infillModelId === 'h_narrow' && oldHn(it.params)) return { ...it, params: { ...it.params, ...nu, hn: undefined } };
        return it;
      }),
    };
  }
  // model 06 je sistem RL10: prečke Ø16 (umesto ranijih Ø30) i izbor broja prečki
  if (out.items.some((it) => it.kind === 'fence' && it.modelId === 'rail_inox' && it.params.barSizeMm === 30 && it.params.barCount === undefined)) {
    out = { ...out, items: out.items.map((it) => (it.kind === 'fence' && it.modelId === 'rail_inox' && it.params.barSizeMm === 30 && it.params.barCount === undefined ? { ...it, materialId: FENCE_MODELS.rail_inox.materialId, params: { ...it.params, barSizeMm: 16, barCount: 4 } } : it)) };
  }
  // stare boje (bela, inox, dekor drvo) više ne postoje: prebacuju se na RAL boje sa karte
  const legacy = (c: string | undefined) => c !== undefined && c in LEGACY_COLORS;
  if (out.items.some((it) => it.kind !== 'opening' && legacy(it.color)) || out.posts.some((x) => legacy(x.color)) || legacy(out.settings.defaultColor)) {
    out = {
      ...out,
      items: out.items.map((it) => (it.kind !== 'opening' && legacy(it.color) ? { ...it, color: normalizeColorKey(it.color) } : it)) as Project['items'],
      posts: out.posts.map((x) => (legacy(x.color) ? { ...x, color: normalizeColorKey(x.color) } : x)),
      settings: { ...out.settings, defaultColor: normalizeColorKey(out.settings.defaultColor) },
    };
  }
  return applyPostRoles(out); // visine stubova prate susedne elemente
}

export type ParseResult = { ok: true; project: Project } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

const GATE_TYPES = ['pedestrian', 'sliding', 'double', 'single'];
const POST_TYPES = ['aluminium', 'concrete', 'concrete_plinth', 'decorative', 'gate'];
const MOUNTS = ['concrete_base', 'wall', 'embedded'];
const STATUSES = ['nacrt', 'ponuda', 'u_izradi', 'zavrseno'];

function checkItem(raw: unknown, i: number): string | null {
  if (!isObj(raw)) return `Element ${i + 1} nije objekat.`;
  if (!isStr(raw.id) || !raw.id) return `Element ${i + 1}: nedostaje ID.`;
  if (!isNum(raw.widthMm) || raw.widthMm <= 0) return `Element ${i + 1}: neispravna širina.`;
  if (!isNum(raw.heightMm) || raw.heightMm <= 0) return `Element ${i + 1}: neispravna visina.`;
  if (raw.kind === 'opening') return null;
  if (raw.kind !== 'fence' && raw.kind !== 'gate') return `Element ${i + 1}: nepoznata vrsta „${String(raw.kind)}".`;
  if (!isStr(raw.color)) return `Element ${i + 1}: nedostaje boja.`;
  if (!isObj(raw.params) || !isNum(raw.params.barSizeMm) || !isNum(raw.params.gapMm) || !isNum(raw.params.frameMm)) return `Element ${i + 1}: neispravni parametri.`;
  if (raw.kind === 'fence' && !((raw.modelId as string) in FENCE_MODELS || (raw.modelId as string) in LEGACY_MODEL_MAP)) return `Element ${i + 1}: nepoznat model „${String(raw.modelId)}".`;
  if (raw.kind === 'gate') {
    if (!GATE_TYPES.includes(raw.gateType as string)) return `Element ${i + 1}: nepoznat tip kapije.`;
    if (!((raw.infillModelId as string) in FENCE_MODELS || (raw.infillModelId as string) in LEGACY_MODEL_MAP)) return `Element ${i + 1}: nepoznat model ispune kapije.`;
  }
  return null;
}

function checkPost(raw: unknown, i: number): string | null {
  if (!isObj(raw)) return `Stub ${i + 1} nije objekat.`;
  if (!isStr(raw.id) || !raw.id) return `Stub ${i + 1}: nedostaje ID.`;
  if (!POST_TYPES.includes(raw.type as string)) return `Stub ${i + 1}: nepoznat tip.`;
  if (!isNum(raw.widthMm) || raw.widthMm <= 0 || !isNum(raw.heightMm) || raw.heightMm <= 0) return `Stub ${i + 1}: neispravne dimenzije.`;
  if (!MOUNTS.includes(raw.mounting as string)) return `Stub ${i + 1}: nepoznat način montaže.`;
  return null;
}

/** Validira strukturu uvezenog JSON-a. Vraća jasnu poruku o grešci, nikad ne baca izuzetak. */
export function parseProject(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Datoteka nije ispravan JSON.' };
  }
  const raw = isObj(data) && 'project' in data ? data.project : data;
  if (isObj(data) && 'schemaVersion' in data && isNum(data.schemaVersion) && data.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, error: `Verzija šeme (${data.schemaVersion}) je novija od podržane (${SCHEMA_VERSION}).` };
  }
  if (!isObj(raw)) return { ok: false, error: 'Nedostaje objekat projekta.' };
  if (!isStr(raw.id) || !raw.id) return { ok: false, error: 'Projekat nema ID.' };
  if (!isStr(raw.name) || !raw.name.trim()) return { ok: false, error: 'Projekat nema naziv.' };
  if (!Array.isArray(raw.items)) return { ok: false, error: 'Nedostaje lista elemenata (items).' };
  if (!Array.isArray(raw.posts)) return { ok: false, error: 'Nedostaje lista stubova (posts).' };
  for (let i = 0; i < raw.items.length; i++) {
    const e = checkItem(raw.items[i], i);
    if (e) return { ok: false, error: e };
  }
  for (let i = 0; i < raw.posts.length; i++) {
    const e = checkPost(raw.posts[i], i);
    if (e) return { ok: false, error: e };
  }
  // verzija 1 je za prazan projekat čuvala jedan "obračunski" stub — to je dozvoljeno i migrira se
  const expectedPosts = raw.items.length + 1;
  if (raw.items.length > 0 && raw.posts.length !== expectedPosts) return { ok: false, error: `Broj stubova (${raw.posts.length}) mora biti ${expectedPosts} za ${raw.items.length} elemenata.` };
  if (raw.items.length === 0 && raw.posts.length > 1) return { ok: false, error: 'Prazan projekat ne sme imati stubove.' };
  const ids = [...(raw.items as LayoutItem[]).map((i) => i.id), ...(raw.posts as Post[]).map((p) => p.id)];
  if (new Set(ids).size !== ids.length) return { ok: false, error: 'ID-jevi elemenata i stubova nisu jedinstveni.' };
  if (!isObj(raw.settings)) return { ok: false, error: 'Nedostaju podešavanja projekta.' };

  const settings = raw.settings as Record<string, unknown>;
  const project = {
    ...(raw as unknown as Project),
    status: STATUSES.includes(raw.status as string) ? (raw.status as Project['status']) : 'nacrt',
    schemaVersion: SCHEMA_VERSION,
    customerId: isStr(raw.customerId) ? raw.customerId : null,
    notes: isStr(raw.notes) ? raw.notes : '',
    quoteNo: isStr(raw.quoteNo) ? raw.quoteNo : '',
    createdAt: isStr(raw.createdAt) ? raw.createdAt : new Date().toISOString(),
    updatedAt: isStr(raw.updatedAt) ? raw.updatedAt : new Date().toISOString(),
    settings: {
      totalMode: settings.totalMode === 'fixed' ? 'fixed' : 'auto',
      fixedTotalMm: isNum(settings.fixedTotalMm) ? settings.fixedTotalMm : 11000,
      fillStrategy: settings.fillStrategy === 'even' ? 'even' : 'proportional',
      defaultHeightMm: isNum(settings.defaultHeightMm) ? settings.defaultHeightMm : 1600,
      defaultColor: isStr(settings.defaultColor) ? settings.defaultColor : RAL_COLORS[0].key,
      ...(settings.defaultFinish === 'mat' || settings.defaultFinish === 'sjaj' || settings.defaultFinish === 'struktura' ? { defaultFinish: settings.defaultFinish } : {}),
      showDimensions: settings.showDimensions !== false,
      showGrid: settings.showGrid !== false,
      showLabels: settings.showLabels !== false,
      pricing: { ...DEFAULT_PRICING, ...(isObj(settings.pricing) ? settings.pricing : {}) },
    },
  } as Project;
  return { ok: true, project: migrateProject(project) };
}
