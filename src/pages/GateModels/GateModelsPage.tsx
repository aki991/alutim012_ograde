import { PencilRuler, RotateCcw, Trash2, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CustomModelThumb } from '../../components/designer/PartsSvg';
import { ElementThumb, SlidingThumb } from '../../components/editor/Catalog';
import { Page, PageHeader } from '../../components/ui/Common';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { GATE_TYPE_LABELS } from '../../domain/gates/gateModels';
import { presetTitle, SLIDING_PRESETS, type SlidingPresetId } from '../../domain/gates/slidingAssembly';
import { DEFAULT_MODEL_ID, GATE_LABELS } from '../../domain/models/catalog';
import type { CustomModel } from '../../domain/models/custom';
import type { GateType } from '../../domain/models/types';
import { useAppStore, useListedProjects } from '../../store/useAppStore';
import { uid } from '../../utils/id';

const BASIC: { type: GateType; subtitle: string }[] = [
  { type: 'pedestrian', subtitle: 'Za prolaz ljudi' },
  { type: 'sliding', subtitle: 'Otvara se klizanjem u stranu' },
  { type: 'double', subtitle: 'Dva krila' },
  { type: 'single', subtitle: 'Jedno krilo' },
];

/**
 * Modeli kapija: ručno nacrtani modeli vrste „Kapija“, isto kao modeli ograda (Koristi model, Otvori crtež, Obriši).
 * U crtežu postoji dugme „Mere kapije“ za podešavanja kapije. Osnovni tipovi kapija se takođe mogu obrisati i vratiti.
 */
export default function GateModelsPage() {
  const navigate = useNavigate();
  const customModels = useAppStore((s) => s.settings.customModels);
  const materials = useAppStore((s) => s.materials);
  const hidden = useAppStore((s) => s.settings.hiddenModels) ?? [];
  const projects = useListedProjects();
  const currentId = useAppStore((s) => s.editor.projectId);
  const current = projects.find((p) => p.id === currentId);
  const models = (customModels ?? []).filter((m) => m.kind === 'gate' && !m.replaces);
  const [del, setDel] = useState<CustomModel | null>(null);
  const [delBasic, setDelBasic] = useState<GateType | null>(null);
  const [choice, setChoice] = useState<CustomModel | null>(null);
  const [delSlidePreset, setDelSlidePreset] = useState<SlidingPresetId | null>(null);
  const hiddenBasic = [...BASIC.filter((b) => hidden.includes(`gate:${b.type}`)), ...SLIDING_PRESETS.filter((p) => hidden.includes(`gate:slide:${p.id}`))];
  const visibleSlidePresets = SLIDING_PRESETS.filter((p) => !hidden.includes(`gate:slide:${p.id}`));
  const rework = (p: SlidingPresetId) => navigate(`/modeli/crtanje/${useAppStore.getState().startSlidingDorada(p)}`);
  const startSliding = (source: { preset: SlidingPresetId } | { template: string }) => { const id = useAppStore.getState().newProjectFromSliding(source); if (id) navigate(`/editor/${id}`); };

  const usedBy = (modelId: string): string[] => projects.filter((p) => p.items.some((it) => it.kind === 'gate' && it.infillModelId === modelId)).map((p) => p.name);
  const startNew = (m: CustomModel) => { const id = useAppStore.getState().newProjectFromGateModel(m.id); if (id) navigate(`/editor/${id}`); };
  const addToOpen = (m: CustomModel) => { if (useAppStore.getState().addGateFromModel(m.id) && current) navigate(`/editor/${current.id}`); };
  const useModel = (m: CustomModel) => { if (current) setChoice(m); else startNew(m); };
  const useBasic = (t: GateType) => navigate(`/editor/${useAppStore.getState().newProject({ modelId: DEFAULT_MODEL_ID, startGate: t, name: `Novi projekat — ${GATE_LABELS[t]}` })}`);

  return (
    <Page>
      <PageHeader title="Modeli kapija" subtitle="Ručno nacrtani modeli kapija. U crtežu kapije dugme „Mere kapije“ otvara podešavanja kapije (mere, zazori, okovi) koja se čuvaju uz model."
        actions={<button className="btn btn-primary" data-testid="btn-create-gate-model" onClick={() => navigate(`/modeli/crtanje/${uid('cm')}`, { state: { kind: 'gate' } })}><PencilRuler size={17} />Napravi model</button>} />
      <section className="mb-7" data-testid="gate-models">
        <h2 className="font-bold text-lg mb-3">Moji modeli kapija (ručno nacrtani)</h2>
        {models.length === 0 ? (
          <p className="text-sm text-muted card p-4" data-testid="gate-models-empty">Još nema modela kapija. Napravite ga dugmetom „Napravi model“ ili u „Mere kapije“ izaberite „Sačuvaj kao model“.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {models.map((m) => (
              <article key={m.id} className="card overflow-hidden flex flex-col" data-testid="gate-model-card">
                <div className="relative aspect-[16/10] bg-[#eef2f6] overflow-hidden border-b border-line p-3"><CustomModelThumb model={m} materials={materials} /></div>
                <div className="p-4 flex-1 flex flex-col">
                  <h3 className="font-bold text-[17px]" data-testid="gate-model-name">{m.name || 'Model bez naziva'}</h3>
                  <p className="text-sm text-muted mt-0.5">Kapija · {m.widthMm} × {m.heightMm} mm · {m.parts.length} delova</p>
                  <p className="text-[12.5px] text-muted">{GATE_TYPE_LABELS[m.gate?.gateType ?? 'pedestrian']} · mere kapije v{m.gate?.version ?? 1}</p>
                  <div className="flex flex-wrap gap-2 mt-auto pt-4">
                    <button className="btn btn-primary" data-testid="use-gate-model" disabled={m.parts.length === 0} onClick={() => useModel(m)}>Koristi model</button>
                    <button className="btn" data-testid="open-gate-model" onClick={() => navigate(`/modeli/crtanje/${m.id}`)}><PencilRuler size={16} />Otvori crtež</button>
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
                  {/* dorada: crtež kapije u crtanju, gde se menja svaki deo (red iznad, da dugmad ostanu u istoj liniji kao kod ograda) */}
                  <div className="w-full flex gap-2">
                    <button className="btn flex-1" data-testid={`rework-gate-${b.type}`} title="Otvara crtež kapije u crtanju, gde se menja svaki deo" onClick={() => navigate(`/modeli/crtanje/${useAppStore.getState().startGateDorada(b.type)}`)}><Wrench size={16} />Doradi</button>
                    <button className="btn btn-danger shrink-0" data-testid={`delete-basic-${b.type}`} aria-label={`Obriši ${GATE_LABELS[b.type]}`} title="Obriši kapiju" onClick={() => setDelBasic(b.type)}><Trash2 size={16} /></button>
                  </div>
                  <button className="btn btn-primary" onClick={() => useBasic(b.type)}>Koristi model</button>
                </div>
              </div>
            </article>
          ))}
          {/* klizne kapije kao sklop: četiri polazne varijante; Doradi pravi nov model koji se menja deo po deo */}
          {visibleSlidePresets.map((p) => (
            <article key={p.id} className="card overflow-hidden flex flex-col" data-testid={`basic-sliding-${p.id}`}>
              <div className="bg-[#eef2f6] border-b border-line p-3 grid place-items-center"><SlidingThumb preset={p.id} /></div>
              <div className="p-4 flex-1 flex flex-col">
                <h3 className="font-bold text-[16px]">{presetTitle(p.id)}</h3>
                <p className="text-sm text-muted">{p.support === 'ground_rail' ? 'Krilo vozi po šini u tlu' : 'Krilo visi na repu i vozi na kolicima'}</p>
                <div className="flex flex-wrap gap-2 mt-auto pt-3">
                  <div className="w-full flex gap-2">
                    <button className="btn flex-1" data-testid={`rework-sliding-${p.id}`} title="Pravi nov model koji se menja deo po deo (okvir, prečke, šina, točkići, vođice, graničnici …)" onClick={() => rework(p.id)}><Wrench size={16} />Doradi</button>
                    <button className="btn btn-danger shrink-0" data-testid={`delete-basic-sliding-${p.id}`} aria-label={`Obriši ${presetTitle(p.id)}`} title="Obriši kapiju" onClick={() => setDelSlidePreset(p.id)}><Trash2 size={16} /></button>
                  </div>
                  <button className="btn btn-primary" data-testid={`use-sliding-${p.id}`} onClick={() => startSliding({ preset: p.id })}>Koristi model</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      {delSlidePreset && (
        <ConfirmDialog title="Brisanje osnovne kapije" danger confirmLabel="Obriši"
          message={<><b>{presetTitle(delSlidePreset)}</b> se uklanja iz kataloga u editoru i sa ove strane. Projekti koji je koriste ostaju isti, a obrisanu možete vratiti dugmetom „Vrati obrisane osnovne kapije“.</>}
          onCancel={() => setDelSlidePreset(null)} onConfirm={() => { useAppStore.getState().hideModel(`gate:slide:${delSlidePreset}`); setDelSlidePreset(null); }} />
      )}
      {choice && (
        <Modal title="Kako želite da koristite model?" onClose={() => setChoice(null)}>
          <p className="text-sm text-slate-600 mb-3">Trenutno je otvoren projekat <b>{current?.name}</b>.</p>
          <div className="flex flex-col gap-2">
            <button className="btn btn-primary justify-start" data-testid="gate-model-new-project" onClick={() => { startNew(choice); setChoice(null); }}>Napravi novi projekat sa ovom kapijom</button>
            <button className="btn justify-start" data-testid="gate-model-add-to-open" onClick={() => { addToOpen(choice); setChoice(null); }}>Dodaj kapiju u otvoreni projekat</button>
            <button className="btn justify-start" onClick={() => setChoice(null)}>Otkaži</button>
          </div>
        </Modal>
      )}
      {del && (
        <ConfirmDialog title="Brisanje modela kapije" danger confirmLabel="Obriši"
          message={usedBy(del.id).length ? <>Model <b>{del.name}</b> koriste projekti: <b>{usedBy(del.id).join(', ')}</b>. Ako ga obrišete, kapije u tim projektima prelaze na podrazumevani model; mere ostaju.</> : <>Model <b>{del.name}</b> se trajno briše.</>}
          onCancel={() => setDel(null)} onConfirm={() => { useAppStore.getState().removeCustomModel(del.id); setDel(null); }} />
      )}
      {delBasic && (
        <ConfirmDialog title="Brisanje osnovne kapije" danger confirmLabel="Obriši"
          message={<><b>{GATE_LABELS[delBasic]}</b> se uklanja iz kataloga u editoru i sa ove strane. Projekti koji je koriste ostaju isti, a obrisanu možete vratiti dugmetom „Vrati obrisane osnovne kapije“.</>}
          onCancel={() => setDelBasic(null)} onConfirm={() => { useAppStore.getState().hideModel(`gate:${delBasic}`); setDelBasic(null); }} />
      )}
    </Page>
  );
}
