import { saveAll } from '../db';
import { useAppStore } from '../store/useAppStore';

const DEBOUNCE_MS = 500;
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let inFlight: Promise<void> = Promise.resolve();

/** Odmah upisuje trenutno stanje. Status „Sačuvano" se postavlja tek kad je IndexedDB transakcija završena. */
export function saveNow(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  const st = useAppStore.getState();
  if (!st.ready) return Promise.resolve();
  const snapshot = { projects: st.projects, customers: st.customers, materials: st.materials, settings: st.settings };
  st.setSaveStatus('saving');
  inFlight = inFlight.then(async () => {
    try {
      await saveAll(snapshot);
      const now = useAppStore.getState();
      // ako se u međuvremenu nešto promenilo, novi upis je već zakazan i status ostaje „Čuvanje..."
      const changed = now.projects !== snapshot.projects || now.customers !== snapshot.customers || now.materials !== snapshot.materials || now.settings !== snapshot.settings;
      if (!changed) now.setSaveStatus('saved');
    } catch (e) {
      useAppStore.getState().setSaveStatus('error', (e as Error).message);
    }
  });
  return inFlight;
}

export function startAutosave(): void {
  if (started) return;
  started = true;
  let prev = useAppStore.getState();
  useAppStore.subscribe((state) => {
    const dataChanged = state.projects !== prev.projects || state.customers !== prev.customers || state.materials !== prev.materials || state.settings !== prev.settings;
    prev = state;
    if (!dataChanged || !state.ready) return;
    if (state.saveStatus !== 'saving') state.setSaveStatus('saving');
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void saveNow(); }, DEBOUNCE_MS);
  });
  window.addEventListener('beforeunload', () => { if (timer) void saveNow(); });
}
