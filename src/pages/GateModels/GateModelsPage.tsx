import { Plus, RotateCcw, Trash2, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ElementThumb, GateModelThumb } from '../../components/editor/Catalog';
import { Page, PageHeader } from '../../components/ui/Common';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { GATE_TYPE_LABELS, type GateModel } from '../../domain/gates/gateModels';
import { DEFAULT_MODEL_ID, FENCE_MODELS, GATE_LABELS, isTerraceModel } from '../../domain/models/catalog';
import type { FenceModelId, GateType } from '../../domain/models/types';
import { useAppStore, useListedProjects } from '../../store/useAppStore';

const BASIC: { type: GateType; subtitle: string }[] = [
  { type: 'pedestrian', subtitle: 'Za prolaz ljudi' },
  { type: 'sliding', subtitle: 'Otvara se klizanjem u stranu' },
  { type: 'double', subtitle: 'Dva krila' },
  { type: 'single', subtitle: 'Jedno krilo' },
];

/** Modeli kapija: sačuvane kapije sa merama i okovima (zamena za šablone) i osnovni tipovi kapija; svaki model se može obrisati. */
export default function GateModelsPage() {
  const navigate = useNavigate();
  const models = useAppStore((s) => s.settings.gateModels) ?? [];
  const hidden = useAppStore((s) => s.settings.hiddenModels) ?? [];
  const projects = useListedProjects();
  const currentId = useAppStore((s) => s.editor.projectId);
  const current = projects.find((p) => p.id === currentId);
  const [pick, setPick] = useState(false);
  const [del, setDel] = useState<GateModel | null>(null);
  const [delBasic, setDelBasic] = useState<GateType | null>(null);
  const hiddenBasic = BASIC.filter((b) => hidden.includes(`gate:${b.type}`));

  const usedBy = (id: string) => projects.filter((p) => p.items.some((i) => i.kind === 'gate' && i.design?.template?.id === id)).map((p) => p.name);
  const edit = (id: string | null, type?: GateType) => { const pid = useAppStore.getState().startGateModelEdit(id, type); navigate(`/editor/${pid}`); };
  const newJob = (m: GateModel) => {
    const st = useAppStore.getState();
    const infill = (m.infillModelId in FENCE_MODELS ? m.infillModelId : DEFAULT_MODEL_ID) as FenceModelId;
    const pid = st.newProject({ modelId: isTerraceModel(infill) ? undefined : infill, startGate: m.gateType, name: `Novi projekat — ${m.name}` });
    const gate = useAppStore.getState().projects.find((p) => p.id === pid)?.items.find((i) => i.kind === 'gate');
    if (gate) useAppStore.getState().applyGateModel(gate.id, m.id);
    navigate(`/editor/${pid}`);
  };
  const addToOpen = (m: GateModel) => { if (useAppStore.getState().addGateFromModel(m.id) && current) navigate(`/editor/${current.id}`); };
  const useBasic = (t: GateType) => navigate(`/editor/${useAppStore.getState().newProject({ modelId: DEFAULT_MODEL_ID, startGate: t, name: `Novi projekat — ${GATE_LABELS[t]}` })}`);

  return (
    <Page>
      <PageHeader title="Modeli kapija" subtitle="Sačuvane kapije sa svim merama i okovima. Model se pravi crtanjem u editoru, uz „Mere kapije“, ili čuvanjem kapije iz projekta."
        actions={<button className="btn btn-primary" data-testid="btn-create-gate-model" onClick={() => setPick(true)}><Plus size={17} />Napravi model kapije</button>} />
      <section className="mb-7" data-testid="gate-models">
        <h2 className="font-bold text-lg mb-3">Moji modeli kapija</h2>
        {models.length === 0 ? (
          <p className="text-sm text-muted card p-4" data-testid="gate-models-empty">Još nema sačuvanih modela. Napravite model dugmetom iznad ili u „Mere kapije“ izaberite „Sačuvaj kao model“.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {models.map((m) => (
              <article key={m.id} className="card overflow-hidden flex flex-col" data-testid="gate-model-card">
                <div className="relative bg-[#eef2f6] border-b border-line p-3 grid place-items-center"><GateModelThumb model={m} /></div>
                <div className="p-4 flex-1 flex flex-col">
                  <h3 className="font-bold text-[17px]" data-testid="gate-model-name">{m.name}</h3>
                  <p className="text-sm text-muted mt-0.5">{GATE_TYPE_LABELS[m.gateType]} · otvor {m.clearWidthMm} × {m.heightMm} mm · v{m.version}</p>
                  <p className="text-[12.5px] text-muted">Ispuna: {FENCE_MODELS[m.infillModelId as FenceModelId]?.name ?? 'model nije pronađen'}</p>
                  <div className="flex flex-wrap gap-2 mt-auto pt-4">
                    <button className="btn btn-primary" data-testid="use-gate-model" onClick={() => newJob(m)}>Nov posao sa modelom</button>
                    <button className="btn" data-testid="add-gate-model" disabled={!current} title={current ? `Dodaje kapiju u projekat „${current.name}“` : 'Nijedan projekat nije otvoren'} onClick={() => addToOpen(m)}>Dodaj u otvoreni projekat</button>
                    <button className="btn" data-testid="edit-gate-model" onClick={() => edit(m.id)}><Wrench size={16} />Uredi</button>
                    <button className="btn btn-danger" data-testid="delete-gate-model" aria-label={`Obriši model ${m.name}`} onClick={() => setDel(m)}><Trash2 size={16} />Obriši</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <section data-testid="basic-gates">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-lg">Osnovne kapije</h2>
          {hiddenBasic.length > 0 && <button className="btn btn-sm" data-testid="restore-basic-gates" onClick={() => useAppStore.getState().updateSettings({ hiddenModels: hidden.filter((h) => !h.startsWith('gate:')) })}><RotateCcw size={14} />Vrati obrisane osnovne kapije ({hiddenBasic.length})</button>}
        </div>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {BASIC.filter((b) => !hidden.includes(`gate:${b.type}`)).map((b) => (
            <article key={b.type} className="card overflow-hidden flex flex-col" data-testid={`basic-gate-${b.type}`}>
              <div className="bg-[#eef2f6] border-b border-line p-3 grid place-items-center"><ElementThumb kind={b.type} model={DEFAULT_MODEL_ID} /></div>
              <div className="p-4 flex-1 flex flex-col">
                <h3 className="font-bold text-[16px]">{GATE_LABELS[b.type]}</h3>
                <p className="text-sm text-muted">{b.subtitle}</p>
                <div className="flex flex-wrap gap-2 mt-auto pt-3">
                  <button className="btn btn-primary" onClick={() => useBasic(b.type)}>Nov posao</button>
                  <button className="btn" data-testid={`edit-basic-${b.type}`} onClick={() => edit(null, b.type)}><Wrench size={16} />Napravi model</button>
                  <button className="btn btn-danger" data-testid={`delete-basic-${b.type}`} aria-label={`Obriši ${GATE_LABELS[b.type]}`} onClick={() => setDelBasic(b.type)}><Trash2 size={16} /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      {pick && (
        <Modal title="Koji tip kapije?" onClose={() => setPick(false)}>
          <p className="text-sm text-muted mb-3">Otvara se editor sa jednom kapijom. U „Mere kapije“ zadajete mere i okove, a na kraju čuvate model.</p>
          <div className="grid grid-cols-2 gap-2">
            {BASIC.map((b) => <button key={b.type} className="btn justify-start" data-testid={`new-gate-model-${b.type}`} onClick={() => { setPick(false); edit(null, b.type); }}>{GATE_LABELS[b.type]}</button>)}
          </div>
        </Modal>
      )}
      {del && (
        <ConfirmDialog title="Brisanje modela kapije" danger confirmLabel="Obriši"
          message={usedBy(del.id).length ? <>Model <b>{del.name}</b> su koristili projekti: <b>{usedBy(del.id).join(', ')}</b>. Oni zadržavaju svoje mere; briše se samo model.</> : <>Model <b>{del.name}</b> se trajno briše.</>}
          onCancel={() => setDel(null)} onConfirm={() => { useAppStore.getState().removeGateModel(del.id); setDel(null); }} />
      )}
      {delBasic && (
        <ConfirmDialog title="Brisanje osnovne kapije" danger confirmLabel="Obriši"
          message={<><b>{GATE_LABELS[delBasic]}</b> se uklanja iz kataloga u editoru i sa ove strane. Projekti koji je koriste ostaju isti, a obrisanu možete vratiti dugmetom „Vrati obrisane osnovne kapije“.</>}
          onCancel={() => setDelBasic(null)} onConfirm={() => { useAppStore.getState().hideModel(`gate:${delBasic}`); setDelBasic(null); }} />
      )}
    </Page>
  );
}
