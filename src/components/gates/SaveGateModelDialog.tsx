import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { GATE_TYPE_LABELS, gateModelFromGate } from '../../domain/gates/gateModels';
import type { Gate } from '../../domain/models/types';
import { useAppStore } from '../../store/useAppStore';
import { uid } from '../../utils/id';

/** Čuvanje kapije kao model kapije: nov model ili prepravka postojećeg (verzija modela raste, stari poslovi se ne menjaju). */
export function SaveGateModelDialog({ gate, clearWidthMm, defaultName, onSaved, onClose }: { gate: Gate; clearWidthMm: number; defaultName: string; onSaved: (modelId: string, name: string, version: number) => void; onClose: () => void }) {
  const models = useAppStore((s) => s.settings.gateModels) ?? [];
  const sourceId = gate.design?.template?.id;
  const source = models.find((m) => m.id === sourceId);
  const [mode, setMode] = useState<'new' | 'overwrite'>(source ? 'overwrite' : 'new');
  const [target, setTarget] = useState(source?.id ?? models[0]?.id ?? '');
  const [name, setName] = useState(source?.name ?? defaultName);
  const base = mode === 'overwrite' ? models.find((m) => m.id === target) : undefined;
  const finalName = (mode === 'overwrite' ? base?.name : name.trim()) ?? '';
  const can = mode === 'new' ? Boolean(name.trim()) : Boolean(base);
  const save = () => {
    const id = base?.id ?? uid('gm');
    const version = base ? base.version + 1 : 1;
    const m = gateModelFromGate(gate, clearWidthMm, finalName, id, version);
    useAppStore.getState().saveGateModel(m);
    onSaved(id, finalName, version);
  };
  return (
    <Modal title="Sačuvaj kao model kapije" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Otkaži</button><button className="btn btn-primary" data-testid="gm-save-confirm" disabled={!can} onClick={save}>Sačuvaj model</button></>}>
      <p className="text-sm text-muted mb-3">Model čuva celu kapiju: tip, ispunu, mere, zazore i okove. Nov posao može da je dobije sa strane „Modeli kapija“ ili iz kataloga u editoru.</p>
      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2"><input type="radio" name="gm-mode" data-testid="gm-mode-new" checked={mode === 'new'} onChange={() => setMode('new')} />Nov model</label>
        {mode === 'new' && <input className="input" data-testid="gm-name" aria-label="Naziv modela" placeholder="Naziv modela kapije" value={name} onChange={(e) => setName(e.target.value)} />}
        <label className={`flex items-center gap-2 ${models.length ? '' : 'text-muted'}`}><input type="radio" name="gm-mode" data-testid="gm-mode-overwrite" disabled={!models.length} checked={mode === 'overwrite'} onChange={() => setMode('overwrite')} />Prepravka postojećeg modela</label>
        {mode === 'overwrite' && (
          <select className="input" data-testid="gm-target" aria-label="Model koji se prepravlja" value={target} onChange={(e) => setTarget(e.target.value)}>
            {models.map((m) => <option key={m.id} value={m.id}>{m.name} — {GATE_TYPE_LABELS[m.gateType]} (v{m.version})</option>)}
          </select>
        )}
        {mode === 'overwrite' && base && <p className="text-[12.5px] text-muted">Prepravka zamenjuje sadržaj modela „{base.name}“ (nova verzija v{base.version + 1}). Poslovi koji su već napravljeni po modelu ostaju kakvi jesu.</p>}
      </div>
    </Modal>
  );
}
