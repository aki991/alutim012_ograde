import { ListChecks, PencilRuler, RotateCcw, Trash2, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CustomModelThumb } from '../../components/designer/PartsSvg';
import { SpecEditor } from '../../components/models/SpecEditor';
import { ModelThumb, Page, PageHeader } from '../../components/ui/Common';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { FENCE_MODEL_LIST, FENCE_MODELS, constructionOf } from '../../domain/models/catalog';
import { CUSTOM_KIND_LABELS, type CustomModel } from '../../domain/models/custom';
import type { FenceModelId } from '../../domain/models/types';
import { useAppStore } from '../../store/useAppStore';
import { itemLabel } from '../../utils/labels';

export default function ModelsPage() {
  const navigate = useNavigate();
  const [choice, setChoice] = useState<FenceModelId | null>(null);
  const [specFor, setSpecFor] = useState<FenceModelId | null>(null);
  const [del, setDel] = useState<CustomModel | null>(null);
  const [restore, setRestore] = useState<CustomModel | null>(null);
  const modelSpecs = useAppStore((s) => s.settings.modelSpecs);
  const customModels = useAppStore((s) => s.settings.customModels);
  const materials = useAppStore((s) => s.materials);
  const projectId = useAppStore((s) => s.editor.projectId);
  const projects = useAppStore((s) => s.projects);
  const selection = useAppStore((s) => s.editor.selection);
  const current = projects.find((p) => p.id === projectId);
  const selected = selection?.type === 'item' ? current?.items.find((i) => i.id === selection.id) : undefined;
  const canApply = selected && selected.kind !== 'opening';

  const usedBy = (modelId: string): string[] => projects.filter((p) => p.items.some((it) => (it.kind === 'fence' && it.modelId === modelId) || (it.kind === 'gate' && it.infillModelId === modelId))).map((p) => p.name);
  const useModel = (m: FenceModelId) => {
    if (!current) { startNew(m); return; }
    setChoice(m);
  };
  const startNew = (m: FenceModelId) => {
    const model = FENCE_MODELS[m];
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
      <PageHeader title="Modeli ograda" subtitle="Svi modeli ograde i pripadajućih kapija. Model se menja bez promene ukupne širine segmenta; boja se postavlja prema slici modela."
        actions={<button className="btn btn-primary" data-testid="btn-create-model" onClick={() => navigate('/modeli/crtanje')}><PencilRuler size={17} />Napravi model</button>} />
      {!!customModels?.some((m) => !m.replaces) && (
        <section className="mb-7" data-testid="custom-models">
          <h2 className="font-bold text-lg mb-3">Moji modeli (ručno nacrtani)</h2>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {customModels!.filter((m) => !m.replaces).map((m) => (
              <article key={m.id} className="card overflow-hidden flex flex-col" data-testid="custom-model-card">
                <div className="relative aspect-[16/10] bg-[#eef2f6] overflow-hidden border-b border-line p-3"><CustomModelThumb model={m} materials={materials} /></div>
                <div className="p-4 flex-1 flex flex-col">
                  <h3 className="font-bold text-[17px]">{m.name || 'Model bez naziva'}</h3>
                  <p className="text-sm text-muted mt-0.5">{CUSTOM_KIND_LABELS[m.kind]} · {m.widthMm} × {m.heightMm} mm · {m.parts.length} delova</p>
                  <div className="flex flex-wrap gap-2 mt-auto pt-4">
                    <button className="btn btn-primary" data-testid="use-custom-model" disabled={m.parts.length === 0} onClick={() => useModel(m.id as FenceModelId)}>Koristi model</button>
                    <button className="btn" data-testid="open-custom-model" onClick={() => navigate(`/modeli/crtanje/${m.id}`)}><PencilRuler size={16} />Otvori crtež</button>
                    <button className="btn btn-danger" aria-label={`Obriši model ${m.name}`} onClick={() => setDel(m)}><Trash2 size={16} />Obriši</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <h2 className="font-bold text-lg mt-7 -mb-2">Modeli iz kataloga</h2>
        </section>
      )}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {FENCE_MODEL_LIST.map((m) => {
          // dorađen model koji zamenjuje original: kartica prikazuje dorađen crtež, uz mogućnost vraćanja originala
          const rep = customModels?.find((c) => c.replaces === m.id);
          if (rep) return (
            <article key={m.id} className="card overflow-hidden flex flex-col" data-testid={`model-card-${m.id}`} data-replaced="true">
              <div className="relative aspect-[16/10] bg-[#eef2f6] overflow-hidden border-b border-line p-3"><CustomModelThumb model={rep} materials={materials} />
                <span className="absolute left-3 top-3 pill !text-[12px] bg-primary text-white" data-testid="badge-reworked">Dorađen</span></div>
              <div className="p-4 flex-1 flex flex-col">
                <h2 className="font-bold text-[17px]">{m.name}</h2>
                <p className="text-sm text-muted mt-0.5">Dorađen crtež modela iz kataloga · {rep.parts.length} delova. Projekti sa ovim modelom koriste dorađen crtež.</p>
                <div className="flex flex-wrap gap-2 mt-auto pt-4">
                  <button className="btn w-full" data-testid={`rework-model-${m.id}`} onClick={() => navigate(`/modeli/crtanje/${rep.id}`, { state: { dorada: true } })}><Wrench size={16} />Doradi</button>
                  <button className="btn btn-primary" data-testid={`use-model-${m.id}`} onClick={() => useModel(rep.id as FenceModelId)}>Koristi model</button>
                  <button className="btn" data-testid={`restore-model-${m.id}`} onClick={() => setRestore(rep)}><RotateCcw size={16} />Vrati original</button>
                </div>
              </div>
            </article>
          );
          return (
          <article key={m.id} className="card overflow-hidden flex flex-col" data-testid={`model-card-${m.id}`}>
            <div className="relative aspect-[16/10] bg-white overflow-hidden border-b border-line"><div className="absolute inset-0"><ModelThumb modelId={m.id} full /></div></div>
            <div className="p-4 flex-1 flex flex-col">
              <h2 className="font-bold text-[17px]">{m.name}</h2>
              <p className="text-sm text-muted mt-0.5">{m.description}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px] mt-3">
                <dt className="text-muted">Tip ispune</dt><dd>{m.infill}</dd>
                <dt className="text-muted">Materijal</dt><dd>{m.material}</dd>
                {constructionOf(m.id) && (
                  <>
                    <dt className="text-muted">Vertikale</dt><dd data-testid={`construction-vertical-${m.id}`}>{constructionOf(m.id)!.vertical}</dd>
                    <dt className="text-muted">Horizontale</dt><dd data-testid={`construction-horizontal-${m.id}`}>{constructionOf(m.id)!.horizontal}</dd>
                  </>
                )}
              </dl>
              {constructionOf(m.id)?.note && (
                <p className="text-[12px] text-muted mt-2" data-testid={`construction-note-${m.id}`}>{constructionOf(m.id)!.note}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-auto pt-4">
                {/* dorada: crtež modela u crtanju, gde se menja svaki deo (red iznad, da glavna dugmad ostanu u istoj liniji) */}
                <button className="btn w-full" data-testid={`rework-model-${m.id}`} title="Otvara crtež modela u crtanju, gde se menja svaki deo" onClick={() => navigate(`/modeli/crtanje/${useAppStore.getState().startDorada(m.id)}`, { state: { dorada: true } })}><Wrench size={16} />Doradi</button>
                <button className="btn btn-primary" data-testid={`use-model-${m.id}`} onClick={() => useModel(m.id)}>Koristi model</button>
                <button className="btn" data-testid={`spec-model-${m.id}`} onClick={() => setSpecFor(m.id)}><ListChecks size={16} />Specifikacija{modelSpecs?.[m.id] ? ' (izmenjena)' : ''}</button>
              </div>
            </div>
          </article>
          );
        })}
      </div>
      {del && <ConfirmDialog title="Brisanje modela" danger confirmLabel="Obriši" message={usedBy(del.id).length ? <>Model <b>{del.name}</b> koriste projekti: <b>{usedBy(del.id).join(', ')}</b>. Ako ga obrišete, ti projekti prelaze na podrazumevani model iz kataloga. Crtež se ne može vratiti.</> : <>Obrisati nacrtani model <b>{del.name}</b>? Crtež se ne može vratiti.</>} onCancel={() => setDel(null)} onConfirm={() => { useAppStore.getState().removeCustomModel(del.id); setDel(null); }} />}
      {restore && restore.replaces && (
        <ConfirmDialog title="Vrati originalni model" confirmLabel="Vrati original"
          message={<>Model <b>{FENCE_MODELS[restore.replaces as FenceModelId]?.name}</b> se vraća na original iz kataloga, a projekti koji ga koriste ponovo dobijaju originalni crtež. Dorađen crtež ostaje sačuvan kao poseban model u „Moji modeli“.</>}
          onCancel={() => setRestore(null)} onConfirm={() => { useAppStore.getState().restoreBuiltin(restore.id); setRestore(null); }} />
      )}
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
