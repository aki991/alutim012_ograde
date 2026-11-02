import { create } from 'zustand';

/**
 * Stanje PRIKAZA (nikad se ne upisuje u projekat, istoriju ni IndexedDB):
 * režim 3D uređivanja, otvorenost kapija, zone otvaranja i sačuvane kamere po projektu.
 */
export type CameraPreset = 'iso' | 'front' | 'top' | 'side';

export interface CameraPose { position: [number, number, number]; target: [number, number, number] }

interface ViewState {
  mode: 'view' | 'edit';
  showZones: boolean;
  /** trenutni procenat otvaranja po ID-ju kapije (0–1) */
  gateOpen: Record<string, number>;
  /** ciljni procenat; razlika ka gateOpen pokreće animaciju */
  gateTarget: Record<string, number>;
  cameras: Record<string, CameraPose>;
  presetRequest: { preset: CameraPreset | 'fit'; nonce: number } | null;

  setMode: (m: 'view' | 'edit') => void;
  setShowZones: (v: boolean) => void;
  openGate: (id: string) => void;
  closeGate: (id: string) => void;
  pauseGate: (id: string) => void;
  setGateOpen: (id: string, v: number) => void;
  setAll: (ids: string[], target: 0 | 1) => void;
  pauseAll: () => void;
  prune: (ids: string[]) => void;
  /** pomera animaciju za dt sekundi; vraća true dok se nešto kreće */
  step: (dt: number) => boolean;
  saveCamera: (projectId: string, pose: CameraPose) => void;
  requestPreset: (p: CameraPreset | 'fit') => void;
}

export const FULL_OPEN_SECONDS = 2.2;
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export const useViewStore = create<ViewState>((set, get) => ({
  mode: 'view',
  showZones: true,
  gateOpen: {},
  gateTarget: {},
  cameras: {},
  presetRequest: null,

  setMode: (mode) => set({ mode }),
  setShowZones: (showZones) => set({ showZones }),
  openGate: (id) => set((s) => ({ gateTarget: { ...s.gateTarget, [id]: 1 } })),
  closeGate: (id) => set((s) => ({ gateTarget: { ...s.gateTarget, [id]: 0 } })),
  pauseGate: (id) => set((s) => ({ gateTarget: { ...s.gateTarget, [id]: s.gateOpen[id] ?? 0 } })),
  setGateOpen: (id, v) => set((s) => ({ gateOpen: { ...s.gateOpen, [id]: clamp01(v) }, gateTarget: { ...s.gateTarget, [id]: clamp01(v) } })),
  setAll: (ids, target) => set((s) => ({ gateTarget: { ...s.gateTarget, ...Object.fromEntries(ids.map((i) => [i, target])) } })),
  pauseAll: () => set((s) => ({ gateTarget: { ...s.gateOpen } })),
  prune: (ids) => {
    const keep = new Set(ids);
    const s = get();
    const stale = Object.keys(s.gateOpen).concat(Object.keys(s.gateTarget)).some((k) => !keep.has(k));
    if (!stale) return;
    const f = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).filter(([k]) => keep.has(k)));
    set({ gateOpen: f(s.gateOpen), gateTarget: f(s.gateTarget) });
  },
  step: (dt) => {
    const s = get();
    let moving = false;
    const open = { ...s.gateOpen };
    let changed = false;
    for (const [id, target] of Object.entries(s.gateTarget)) {
      const cur = open[id] ?? 0;
      if (cur === target) continue;
      const d = dt / FULL_OPEN_SECONDS;
      const next = cur < target ? Math.min(target, cur + d) : Math.max(target, cur - d);
      open[id] = next;
      changed = true;
      if (next !== target) moving = true;
    }
    if (changed) set({ gateOpen: open });
    return moving;
  },
  saveCamera: (projectId, pose) => set((s) => ({ cameras: { ...s.cameras, [projectId]: pose } })),
  requestPreset: (preset) => set((s) => ({ presetRequest: { preset, nonce: (s.presetRequest?.nonce ?? 0) + 1 } })),
}));
