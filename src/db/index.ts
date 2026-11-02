import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AppSettings, Customer, Material, Project } from '../domain/models/types';

interface AluDB extends DBSchema {
  projects: { key: string; value: Project };
  customers: { key: string; value: Customer };
  materials: { key: string; value: Material };
  kv: { key: string; value: unknown };
}

export interface PersistedData {
  projects: Project[];
  customers: Customer[];
  materials: Material[];
  settings: AppSettings | null;
  seeded: boolean;
}

export const DB_NAME = 'alu-tim-012';
let dbPromise: Promise<IDBPDatabase<AluDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<AluDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AluDB>(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('projects', { keyPath: 'id' });
        db.createObjectStore('customers', { keyPath: 'id' });
        db.createObjectStore('materials', { keyPath: 'id' });
        db.createObjectStore('kv');
      },
    });
  }
  return dbPromise;
}

export async function loadAll(): Promise<PersistedData> {
  const db = await getDb();
  const [projects, customers, materials, settings, seeded] = await Promise.all([
    db.getAll('projects'),
    db.getAll('customers'),
    db.getAll('materials'),
    db.get('kv', 'settings') as Promise<AppSettings | undefined>,
    db.get('kv', 'seeded') as Promise<boolean | undefined>,
  ]);
  return { projects, customers, materials, settings: settings ?? null, seeded: Boolean(seeded) };
}

/** Upis svih kolekcija u jednoj transakciji. Promise se razrešava tek kad je transakcija zaista završena. */
export async function saveAll(data: Omit<PersistedData, 'seeded'>): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['projects', 'customers', 'materials', 'kv'], 'readwrite');
  await Promise.all([tx.objectStore('projects').clear(), tx.objectStore('customers').clear(), tx.objectStore('materials').clear()]);
  for (const p of data.projects) tx.objectStore('projects').put(p);
  for (const c of data.customers) tx.objectStore('customers').put(c);
  for (const m of data.materials) tx.objectStore('materials').put(m);
  if (data.settings) tx.objectStore('kv').put(data.settings, 'settings');
  tx.objectStore('kv').put(true, 'seeded');
  await tx.done;
}

export async function wipeAll(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['projects', 'customers', 'materials', 'kv'], 'readwrite');
  await Promise.all(['projects', 'customers', 'materials', 'kv'].map((s) => tx.objectStore(s as 'projects').clear()));
  await tx.done;
}
