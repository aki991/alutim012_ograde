import { create } from 'zustand';
import { loadSyncState, saveSyncState } from '../db';
import type { AppSettings, Customer, Material, Project } from '../domain/models/types';
import { SEED_SETTINGS } from '../data/seed';
import { useAppStore } from '../store/useAppStore';
import { supabase } from './supabase';

/**
 * Sinhronizacija sa Supabase-om. Lokalna baza (IndexedDB) ostaje keš, pa aplikacija radi i bez interneta;
 * kad je veza tu, izmene se šalju u bazu, a tuđe izmene stižu nazad. Svaki red (projekat, kupac, materijal,
 * model, šablon …) se usklađuje zasebno; kod istovremene izmene istog reda pobeđuje poslednji upis.
 */

export type Coll = 'projects' | 'customers' | 'materials' | 'settings';
const COLLS: Coll[] = ['projects', 'customers', 'materials', 'settings'];
const TABLE: Record<Coll, string> = { projects: 'ograde_projects', customers: 'ograde_customers', materials: 'ograde_materials', settings: 'ograde_settings' };

export interface RowState { ts: string; hash: string }
export type SyncState = Record<Coll, Record<string, RowState>>;
const emptyState = (): SyncState => ({ projects: {}, customers: {}, materials: {}, settings: {} });

/* ---------- podešavanja: jedan red po ključu, a liste/rečnike delimo po stavkama (modeli, šabloni, magacin …) ---------- */

/** liste objekata sa ID-em: svaka stavka je poseban red */
export const ARRAY_KEYS = ['customModels', 'postTemplates', 'gateHardware', 'gateProfiles', 'stock'] as const;
/** rečnici: svaki ključ je poseban red */
export const RECORD_KEYS = ['modelSpecs'] as const;

export interface Wrapped { v: unknown; o?: number }

export function flattenSettings(s: AppSettings): Map<string, Wrapped> {
  const out = new Map<string, Wrapped>();
  for (const [k, v] of Object.entries(s as unknown as Record<string, unknown>)) {
    if (v === undefined) continue;
    if ((ARRAY_KEYS as readonly string[]).includes(k) && Array.isArray(v)) {
      v.forEach((item, i) => out.set(`${k}/${String((item as { id?: string })?.id ?? i)}`, { v: item, o: i }));
    } else if ((RECORD_KEYS as readonly string[]).includes(k) && v && typeof v === 'object') {
      for (const [rk, rv] of Object.entries(v as Record<string, unknown>)) out.set(`${k}/${rk}`, { v: rv });
    } else out.set(k, { v });
  }
  return out;
}

export function unflattenSettings(flat: Map<string, Wrapped>): AppSettings {
  const out: Record<string, unknown> = {};
  const lists: Record<string, Array<[number, unknown]>> = {};
  for (const [id, w] of flat) {
    const slash = id.indexOf('/');
    if (slash < 0) { out[id] = w.v; continue; }
    const key = id.slice(0, slash);
    const rest = id.slice(slash + 1);
    if ((ARRAY_KEYS as readonly string[]).includes(key)) (lists[key] ??= []).push([w.o ?? 0, w.v]);
    else if ((RECORD_KEYS as readonly string[]).includes(key)) ((out[key] ??= {}) as Record<string, unknown>)[rest] = w.v;
  }
  for (const [k, arr] of Object.entries(lists)) out[k] = arr.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  return { ...SEED_SETTINGS, ...out } as AppSettings;
}

/* ---------- otisak sadržaja ---------- */

const memo = new WeakMap<object, string>();
function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return `${(h >>> 0).toString(36)}.${str.length}`;
}
export function hashOf(value: unknown): string {
  if (value && typeof value === 'object') {
    const hit = memo.get(value);
    if (hit) return hit;
    const h = djb2(JSON.stringify(value));
    memo.set(value, h);
    return h;
  }
  return djb2(JSON.stringify(value) ?? 'undefined');
}

interface LocalRow { data: unknown; hash: string }

export function localRows(coll: Coll): Map<string, LocalRow> {
  const st = useAppStore.getState();
  const out = new Map<string, LocalRow>();
  if (coll === 'settings') {
    for (const [id, w] of flattenSettings(st.settings)) out.set(id, { data: w, hash: `${hashOf(w.v)}|${w.o ?? ''}` });
    return out;
  }
  const list: Array<{ id: string }> = coll === 'projects' ? st.projects.filter((p) => !p.modelDraft) : coll === 'customers' ? st.customers : st.materials;
  for (const x of list) out.set(x.id, { data: x, hash: hashOf(x) });
  return out;
}

/* ---------- stanje ---------- */

interface CloudStatus {
  status: 'off' | 'syncing' | 'synced' | 'offline' | 'error';
  error: string | null;
  /** prva sinhronizacija posle prijave je završena (ili neuspela): tek tada aplikacija prikazuje podatke */
  firstDone: boolean;
  lastSync: string | null;
}
export const useCloudStatus = create<CloudStatus>(() => ({ status: 'off', error: null, firstDone: false, lastSync: null }));
const setStatus = (p: Partial<CloudStatus>) => useCloudStatus.setState(p);

let state: SyncState = emptyState();
let stateLoaded = false;
let active = false;
let busy: Promise<void> | null = null;
let rerun = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

async function ensureState(): Promise<void> {
  if (stateLoaded) return;
  const saved = await loadSyncState<SyncState>().catch(() => null);
  state = { ...emptyState(), ...(saved ?? {}) };
  stateLoaded = true;
}
const persistState = () => saveSyncState(state).catch(() => undefined);

const chunk = <T,>(arr: T[], n: number): T[][] => { const out: T[][] = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

function errorMessage(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/relation .* does not exist|schema cache|PGRST205|404/i.test(m)) return 'Tabele u bazi još nisu napravljene (pokrenuti migraciju ograde_sync.sql).';
  if (/failed to fetch|network|load failed|timeout/i.test(m)) return 'Nema veze sa serverom.';
  if (/jwt|permission|row-level|401|403/i.test(m)) return 'Nema dozvolu za pristup bazi. Prijavite se ponovo.';
  return m;
}

/* ---------- preuzimanje ---------- */

interface RemoteRow { id: string; data: unknown; updated_at: string }

async function remoteIndex(coll: Coll): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase!.from(TABLE[coll]).select('id, updated_at').order('id').range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) out.set(r.id as string, r.updated_at as string);
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function remoteRows(coll: Coll, ids: string[]): Promise<RemoteRow[]> {
  const out: RemoteRow[] = [];
  for (const part of chunk(ids, 15)) {
    const { data, error } = await supabase!.from(TABLE[coll]).select('id, data, updated_at').in('id', part);
    if (error) throw error;
    out.push(...((data ?? []) as RemoteRow[]));
  }
  return out;
}

/** Povlači tuđe izmene. Red koji je lokalno menjan a još nije poslat se ne dira (lokalna izmena se šalje u push-u). */
async function pull(): Promise<void> {
  const firstEver = COLLS.every((c) => Object.keys(state[c]).length === 0);
  let remoteHadRows = false;
  const plans = new Map<Coll, { fetch: string[]; remove: string[]; remote: Map<string, string> }>();

  for (const coll of COLLS) {
    const remote = await remoteIndex(coll);
    if (remote.size) remoteHadRows = true;
    const local = localRows(coll);
    const known = state[coll];
    const fetchIds: string[] = [];
    const removeIds: string[] = [];
    for (const [id, ts] of remote) {
      const k = known[id];
      const l = local.get(id);
      if (!l) { if (!k) fetchIds.push(id); /* k: obrisano lokalno, push će obrisati i u bazi */ }
      else if (!k) fetchIds.push(id); // isti ID postoji lokalno i u bazi, a nikad nije usklađen: pobeđuje baza
      else if (k.ts !== ts && l.hash === k.hash) fetchIds.push(id);
    }
    for (const [id, k] of Object.entries(known)) {
      if (remote.has(id)) continue;
      const l = local.get(id);
      if (!l) delete known[id]; // obrisano na obe strane
      else if (l.hash === k.hash) removeIds.push(id); // obrisano u bazi, lokalno nije menjano
    }
    plans.set(coll, { fetch: fetchIds, remove: removeIds, remote });
  }

  // podaci se preuzimaju unapred, a primenjuju odjednom i sinhrono, da se lokalne izmene u međuvremenu ne pregaze
  const fetched = new Map<Coll, RemoteRow[]>();
  for (const coll of COLLS) fetched.set(coll, await remoteRows(coll, plans.get(coll)!.fetch));

  const patch: Parameters<ReturnType<typeof useAppStore.getState>['applyRemote']>[0] = {};
  const touched: Record<Coll, string[]> = { projects: [], customers: [], materials: [], settings: [] };
  const stamps: Record<Coll, Map<string, string>> = { projects: new Map(), customers: new Map(), materials: new Map(), settings: new Map() };

  for (const coll of COLLS) {
    const plan = plans.get(coll)!;
    const local = localRows(coll);
    const known = state[coll];
    const clean = (id: string) => { const l = local.get(id); const k = known[id]; return !l || !k || l.hash === k.hash; };
    const up = fetched.get(coll)!.filter((r) => { const k = known[r.id]; return !k || clean(r.id); });
    const rm = plan.remove.filter((id) => { const k = known[id]; const l = local.get(id); return !l || (k && l.hash === k.hash); });
    for (const r of up) stamps[coll].set(r.id, r.updated_at);
    touched[coll] = [...up.map((r) => r.id), ...rm];

    if (coll === 'settings') {
      if (!up.length && !rm.length) continue;
      const flat = flattenSettings(useAppStore.getState().settings);
      for (const r of up) flat.set(r.id, r.data as Wrapped);
      for (const id of rm) flat.delete(id);
      patch.settings = unflattenSettings(flat);
    } else if (up.length || rm.length) {
      (patch as Record<string, unknown>)[coll] = { upsert: up.map((r) => r.data) as Array<Project | Customer | Material>, remove: rm };
    }
    for (const id of rm) delete known[id];
  }

  if (patch.projects || patch.customers || patch.materials || patch.settings) useAppStore.getState().applyRemote(patch);

  // otisci se računaju iz stanja posle primene (migracije projekta mogu da promene sadržaj)
  for (const coll of COLLS) {
    const local = localRows(coll);
    for (const id of touched[coll]) {
      const l = local.get(id);
      const ts = stamps[coll].get(id);
      if (l && ts) state[coll][id] = { ts, hash: l.hash };
    }
  }
  await persistState();

  // nov uređaj uključen u postojeću bazu: jednokratne popravke materijala je već odradio neki drugi uređaj
  if (firstEver && remoteHadRows) {
    try { for (const k of ['alutim.modelMaterialsV1', 'alutim.materialNamesV2', 'alutim.carriagesV1', 'alutim.railProfileV1', 'alutim.slopePlateV1', 'alutim.terraceMaterialsV2']) localStorage.setItem(k, '1'); } catch { /* bez localStorage-a */ }
  }
}

/* ---------- slanje ---------- */

async function push(): Promise<void> {
  for (const coll of COLLS) {
    const local = localRows(coll);
    const known = state[coll];
    const changed = [...local].filter(([id, r]) => known[id]?.hash !== r.hash);
    const removed = Object.keys(known).filter((id) => !local.has(id));
    for (const part of chunk(changed, 10)) {
      const { data, error } = await supabase!.from(TABLE[coll]).upsert(part.map(([id, r]) => ({ id, data: r.data })), { onConflict: 'id' }).select('id, updated_at');
      if (error) throw error;
      for (const row of data ?? []) {
        const l = part.find(([id]) => id === row.id)?.[1];
        if (l) known[row.id as string] = { ts: row.updated_at as string, hash: l.hash };
      }
      await persistState();
    }
    for (const part of chunk(removed, 50)) {
      const { error } = await supabase!.from(TABLE[coll]).delete().in('id', part);
      if (error) throw error;
      for (const id of part) delete known[id];
      await persistState();
    }
  }
}

/* ---------- raspored ---------- */

async function run(withPull: boolean): Promise<void> {
  if (!supabase || !active || !useAppStore.getState().ready) return;
  if (busy) { rerun = true; await busy; return; }
  busy = (async () => {
    setStatus({ status: 'syncing' });
    try {
      await ensureState();
      if (withPull) await pull();
      await push();
      setStatus({ status: 'synced', error: null, lastSync: new Date().toISOString() });
    } catch (e) {
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      setStatus({ status: offline || /Nema veze/.test(errorMessage(e)) ? 'offline' : 'error', error: errorMessage(e) });
    } finally {
      busy = null;
    }
  })();
  await busy;
  if (rerun) { rerun = false; await run(false); }
}

/** poziva se posle svakog lokalnog čuvanja: izmene idu u bazu uz kratko čekanje da se više izmena objedini */
export function schedulePush(): void {
  if (!active) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushTimer = null; void run(false); }, 1500);
}

/** Pokreće sinhronizaciju za prijavljenog korisnika: prva razmena odmah, zatim na svakih 45 s, pri povratku na prozor i kad se vrati internet. */
export function startCloudSync(): () => void {
  if (!supabase) { setStatus({ firstDone: true }); return () => undefined; }
  active = true;
  const tick = () => { void run(true); };
  const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
  void Promise.race([run(true), new Promise<void>((r) => setTimeout(r, 12_000))]).finally(() => setStatus({ firstDone: true }));
  const iv = setInterval(tick, 45_000);
  window.addEventListener('online', tick);
  window.addEventListener('focus', tick);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    active = false;
    clearInterval(iv);
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    window.removeEventListener('online', tick);
    window.removeEventListener('focus', tick);
    document.removeEventListener('visibilitychange', onVisible);
    setStatus({ status: 'off', firstDone: false });
  };
}

/** za testove */
export function _resetCloudSyncForTests(): void { state = emptyState(); stateLoaded = false; active = false; busy = null; rerun = false; }
