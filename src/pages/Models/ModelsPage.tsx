import { ListChecks } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SpecEditor } from '../../components/models/SpecEditor';
import { ModelThumb, Page, PageHeader } from '../../components/ui/Common';
import { Modal } from '../../components/ui/Modal';
import { FENCE_MODEL_LIST } from '../../domain/models/catalog';
import type { FenceModelId } from '../../domain/models/types';
import { useAppStore } from '../../store/useAppStore';
import { itemLabel } from '../../utils/labels';

export default function ModelsPage() {
  const navigate = useNavigate();
  const [choice, setChoice] = useState<FenceModelId | null>(null);
  const [specFor, setSpecFor] = useState<FenceModelId | null>(null);
  const modelSpecs = useAppStore((s) => s.settings.modelSpecs);
  const projectId = useAppStore((s) => s.editor.projectId);
  const projects = useAppStore((s) => s.projects);
  const selection = useAppStore((s) => s.editor.selection);
  const current = projects.find((p) => p.id === projectId);
  const selected = selection?.type === 'item' ? current?.items.find((i) => i.id === selection.id) : undefined;
  const canApply = selected && selected.kind !== 'opening';

  const useModel = (m: FenceModelId) => {
    if (!current) { startNew(m); return; }
    setChoice(m);
  };
  const startNew = (m: FenceModelId) => {
    const model = FENCE_MODEL_LIST.find((x) => x.id === m)!;
    navigate(`/editor/${useAppStore.getState().newProject({ modelId: m, name: `Novi projekat — ${model.name}` })}`);
  };
  const apply = (m: FenceModelId) => {
    if (!current || !selected) return;
    useAppStore.getState().setActiveModel(m);
    useAppStore.getState().setItemModel(selected.id, m);
    navigate(`/editor/${current.id}`);
  };

  return (
    <Page>
      <PageHeader title="Modeli ograda" subtitle="Svi modeli ograde i pripadajućih kapija. Model se menja bez promene ukupne širine segmenta; boja se postavlja prema slici modela." />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {FENCE_MODEL_LIST.map((m) => (
          <article key={m.id} className="card overflow-hidden flex flex-col" data-testid={`model-card-${m.id}`}>
            <div className="relative aspect-[16/10] bg-white overflow-hidden border-b border-line"><div className="absolute inset-0"><ModelThumb modelId={m.id} full /></div></div>
            <div className="p-4 flex-1 flex flex-col">
              <h2 className="font-bold text-[17px]">{m.name}</h2>
              <p className="text-sm text-muted mt-0.5">{m.description}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px] mt-3">
                <dt className="text-muted">Tip ispune</dt><dd>{m.infill}</dd>
                <dt className="text-muted">Materijal</dt><dd>{m.material}</dd>
              </dl>
              <div className="flex flex-wrap gap-2 mt-4">
                <button className="btn btn-primary" data-testid={`use-model-${m.id}`} onClick={() => useModel(m.id)}>Koristi model</button>
                <button className="btn" data-testid={`spec-model-${m.id}`} onClick={() => setSpecFor(m.id)}><ListChecks size={16} />Specifikacija{modelSpecs?.[m.id] ? ' (izmenjena)' : ''}</button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {specFor && <SpecEditor modelId={specFor} onClose={() => setSpecFor(null)} />}
      {choice && current && (
        <Modal title="Kako želite da koristite model?" onClose={() => setChoice(null)}>
          <p className="text-sm text-slate-600 mb-2">Trenutno je otvoren projekat <b>{current.name}</b>. Izmene u projektima se čuvaju automatski.</p>
          <p className="text-sm mb-4 rounded-lg bg-slate-50 border border-line px-3 py-2" data-testid="apply-target">
            {canApply && selected ? <>Izabrani segment: <b>{itemLabel(current.items, current.items.findIndex((i) => i.id === selected.id))}</b> ({selected.widthMm} mm)</> : 'Nijedan segment nije izabran. Da biste primenili model na segment, otvorite projekat u editoru i kliknite segment ograde ili kapije.'}
          </p>
          <div className="flex flex-col gap-2">
            <button className="btn btn-primary justify-start" onClick={() => { startNew(choice); setChoice(null); }}>Napravi novi projekat sa ovim modelom</button>
            <button className="btn justify-start" disabled={!canApply} data-testid="apply-to-selected" onClick={() => { apply(choice); setChoice(null); }}>
              Primeni na izabrani segment{canApply ? '' : ' (nijedan segment nije izabran u editoru)'}
            </button>
            <button className="btn justify-start" onClick={() => setChoice(null)}>Otkaži</button>
          </div>
        </Modal>
      )}
    </Page>
  );
}
