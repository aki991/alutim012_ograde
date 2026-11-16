import { leafHeightOf } from '../../domain/gates/slidingLayout';
import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { gateConfigFromGate, GATE_TYPE_LABELS } from '../../domain/gates/gateModels';
import { builtinToCustom } from '../../domain/models/fromBuiltin';
import { customModelOf } from '../../domain/models/customRegistry';
import type { CustomModel } from '../../domain/models/custom';
import type { FenceModelId, Gate } from '../../domain/models/types';
import { useAppStore } from '../../store/useAppStore';
import { uid } from '../../utils/id';

/**
 * Čuvanje kapije kao model kapije: nov model (crtež ispune kapije + podešavanja iz „Mere kapije“) ili prepravka postojećeg modela.
 * Model kapije je ručno nacrtan model vrste „Kapija“, pa se čuva i otvara kao i modeli ograda.
 */
export function SaveGateModelDialog({ gate, clearWidthMm, defaultName, onSaved, onClose }: { gate: Gate; clearWidthMm: number; defaultName: string; onSaved: (modelId: string, name: string, version: number) => void; onClose: () => void }) {
  const all = useAppStore((s) => s.settings.customModels);
  const models = (all ?? []).filter((m) => m.kind === 'gate' && !m.replaces);
  const sourceId = gate.design?.template?.id;
  const source = models.find((m) => m.id === sourceId);
  const [mode, setMode] = useState<'new' | 'overwrite'>(source ? 'overwrite' : 'new');
  const [target, setTarget] = useState(source?.id ?? models[0]?.id ?? '');
  const [name, setName] = useState(source?.name ?? defaultName);
  const base = mode === 'overwrite' ? models.find((m) => m.id === target) : undefined;
  const can = mode === 'new' ? Boolean(name.trim()) : Boolean(base);

  const save = () => {
    const st = useAppStore.getState();
    const list = st.settings.customModels ?? [];
    const now = new Date().toISOString();
    if (base) {
      // prepravka: crtež modela ostaje, menjaju se podešavanja kapije (mere, okovi, tip), visina i boja
      const version = (base.gate?.version ?? 1) + 1;
      const next: CustomModel = { ...base, heightMm: leafHeightOf(gate), color: gate.color, gate: gateConfigFromGate(gate, clearWidthMm, version), updatedAt: now };
      st.updateSettings({ customModels: list.map((m) => (m.id === base.id ? next : m)) });
      onSaved(base.id, base.name, version);
      return;
    }
    const id = uid('cm');
    const src = customModelOf(gate.infillModelId) ?? builtinToCustom(gate.infillModelId as FenceModelId, st.materials, id, clearWidthMm, leafHeightOf(gate));
    const copy = JSON.parse(JSON.stringify(src)) as CustomModel;
    const next: CustomModel = { ...copy, id, name: name.trim(), kind: 'gate', replaces: undefined, heightMm: leafHeightOf(gate), color: gate.color, gate: gateConfigFromGate(gate, clearWidthMm, 1), updatedAt: now };
    st.updateSettings({ customModels: [...list, next] });
    onSaved(id, next.name, 1);
  };

  return (
    <Modal title="Sačuvaj kao model kapije" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Otkaži</button><button className="btn btn-primary" data-testid="gm-save-confirm" disabled={!can} onClick={save}>Sačuvaj model</button></>}>
      <p className="text-sm text-muted mb-3">Model čuva crtež kapije i sve što je zadato u „Mere kapije“: tip, mere, zazore i okove. Nalazi se na strani „Modeli kapija“, gde se otvara crtež i koristi za nove poslove.</p>
      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2"><input type="radio" name="gm-mode" data-testid="gm-mode-new" checked={mode === 'new'} onChange={() => setMode('new')} />Nov model</label>
        {mode === 'new' && <input className="input" data-testid="gm-name" aria-label="Naziv modela" placeholder="Naziv modela kapije" value={name} onChange={(e) => setName(e.target.value)} />}
        <label className={`flex items-center gap-2 ${models.length ? '' : 'text-muted'}`}><input type="radio" name="gm-mode" data-testid="gm-mode-overwrite" disabled={!models.length} checked={mode === 'overwrite'} onChange={() => setMode('overwrite')} />Prepravka postojećeg modela</label>
        {mode === 'overwrite' && (
          <select className="input" data-testid="gm-target" aria-label="Model koji se prepravlja" value={target} onChange={(e) => setTarget(e.target.value)}>
            {models.map((m) => <option key={m.id} value={m.id}>{m.name} — {GATE_TYPE_LABELS[m.gate?.gateType ?? 'pedestrian']} (v{m.gate?.version ?? 1})</option>)}
          </select>
        )}
        {mode === 'overwrite' && base && <p className="text-[12.5px] text-muted">Prepravka zamenjuje podešavanja modela „{base.name}“ (nova verzija v{(base.gate?.version ?? 1) + 1}); crtež ostaje isti. Poslovi koji su već napravljeni po modelu ostaju kakvi jesu.</p>}
      </div>
    </Modal>
  );
}
