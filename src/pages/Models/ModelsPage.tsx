import { MultiSelect } from '../../components/ui/MultiSelect';
import { PencilRuler, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CustomModelThumb } from '../../components/designer/PartsSvg';
import { SpecEditor } from '../../components/models/SpecEditor';
import { ActionsMenu, ModelThumb, Page, PageHeader } from '../../components/ui/Common';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { extraSpecKey } from '../../domain/models/spec';
import { FENCE_MODELS, REMOVED_MODELS, TERRACE_MODEL_LIST, YARD_MODEL_LIST, constructionOf } from '../../domain/models/catalog';
import { CUSTOM_KIND_LABELS, type CustomModel } from '../../domain/models/custom';
import type { FenceModelId } from '../../domain/models/types';
import { useAppStore, useListedProjects } from '../../store/useAppStore';
import { uid } from '../../utils/id';
import { itemLabel } from '../../utils/labels';
import { allFenceModels, terraceVariants } from '../../domain/models/customRegistry';

/**
 * Modeli ograda (dvorište) ili, sa `terrace`, Modeli ograda za terase: isti prikaz, a odvojeni spiskovi modela, nacrtanih modela i
 * crtanja. Ograde za terase (rukohvat, prečke, staklo) nemaju veze sa dvorišnim ogradama.
 */
export default function ModelsPage({ terrace = false }: { terrace?: boolean }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const matches = (name: string) => name.toLocaleLowerCase('sr').includes(search.toLocaleLowerCase('sr'));
  const [choice, setChoice] = useState<FenceModelId | null>(null);
  const [specFor, setSpecFor] = useState<FenceModelId | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [del, setDel] = useState<CustomModel | null>(null);
  const [delBuiltin, setDelBuiltin] = useState<FenceModelId | null>(null);
  const hiddenModels = useAppStore((s) => s.settings.hiddenModels);
  const list = terrace ? TERRACE_MODEL_LIST : YARD_MODEL_LIST;
  const drawPath = terrace ? '/modeli-terasa/crtanje' : '/modeli/crtanje';
  const kind: CustomModel['kind'] = terrace ? 'terrace' : 'fence';
  const modelSpecs = useAppStore((s) => s.settings.modelSpecs);
  const customModels = useAppStore((s) => s.settings.customModels);
  const terraceIds = useAppStore((s) => s.settings.terraceModelIds) ?? [];
  const materials = useAppStore((s) => s.materials);
  const projectId = useAppStore((s) => s.editor.projectId);
  const projects = useListedProjects();
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

  const copyModel = (m: CustomModel) => {
    const { replaces: _r, gateDefault: _d, terraceSourceId: _t, ...rest } = m;
    const id = uid('cm'); const st = useAppStore.getState();
    st.updateSettings({ customModels: [...(st.settings.customModels ?? []), { ...rest, id, name: `${m.name} — kopija`, updatedAt: new Date().toISOString() }],
      ...(modelSpecs?.[extraSpecKey(m.id)] ? { modelSpecs: { ...modelSpecs, [extraSpecKey(id)]: structuredClone(modelSpecs[extraSpecKey(m.id)]) } } : {}) });
  };
  const menu = (id: string, remove: () => void, model?: CustomModel) => <ActionsMenu label="Radnje modela" actions={[
    { label: 'Sastavnica', onClick: () => setSpecFor(id as FenceModelId) },
    ...(model && !model.terraceSourceId ? [{ label: 'Preimenuj', onClick: () => { setRenameName(model.name); setRenaming(model.id); } }] : []),
    { label: 'Napravi kopiju', onClick: () => model ? copyModel(model) : navigate(`${drawPath}/${useAppStore.getState().startDorada(id as FenceModelId)}`, { state: { dorada: true } }) },
    { label: model?.terraceSourceId ? 'Ukloni iz terasa' : 'Obriši model', onClick: remove, danger: true },
  ]} />;

  // ručno nacrtani modeli: za dvorišne ograde idu u istu mrežu kao ostali modeli (bez posebnog naslova), za terase u svoj odeljak
  // nacrtani modeli i dorađeni crteži obrisanih originala iz kataloga (oni su sada obični nacrtani modeli)
  const standalone = (m: CustomModel) => !m.replaces || REMOVED_MODELS.has(m.replaces);
  const cardModels = [...(customModels?.filter((m) => standalone(m) && m.kind === kind) ?? []), ...(terrace ? terraceVariants() : [])];
  const shownCatalog = list.filter((m) => !hiddenModels?.includes(m.id) && matches(m.name) && filter !== 'custom' && (filter !== 'shared' || terraceIds.includes(m.id)));
  const customCards = cardModels.filter((m) => matches(m.name) && filter !== 'catalog' && (filter !== 'shared' || Boolean(m.terraceSourceId) || terraceIds.includes(m.id))).map((m) => (
      <article key={m.id} className="card overflow-hidden flex flex-col" data-testid="custom-model-card">
        <div className="relative aspect-[16/10] bg-[#eef2f6] overflow-hidden border-b border-line p-3"><CustomModelThumb model={m} materials={materials} /></div>
        <div className="p-4 flex-1 flex flex-col">
          <h3 className="min-h-[48px] line-clamp-2 font-bold text-[17px]" data-testid="model-name">{m.name || 'Model bez naziva'}</h3>
          <p className="text-sm text-muted mt-0.5">{m.terraceSourceId || terraceIds.includes(m.id) ? 'Dvorišni model dostupan i za terase' : CUSTOM_KIND_LABELS[m.kind]} · {m.widthMm} × {m.heightMm} mm · {m.parts.length} delova</p>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 mt-auto pt-4 [&>.btn]:whitespace-normal [&>.btn]:min-w-0">
            <button className="btn flex-1 !px-2" data-testid="open-custom-model" onClick={() => navigate(m.terraceSourceId ? `/modeli/crtanje/${m.terraceSourceId.startsWith('cm_') ? m.terraceSourceId : useAppStore.getState().startDorada(m.terraceSourceId as FenceModelId)}` : `${drawPath}/${m.id}`)}><PencilRuler size={16} />Uredi model</button>
            <button className="btn btn-primary flex-1 !px-2" data-testid="use-custom-model" disabled={m.parts.length === 0} onClick={() => useModel(m.id as FenceModelId)}>Koristi model</button>
            {menu(m.id, () => m.terraceSourceId
              ? useAppStore.getState().updateSettings({ terraceModelIds: terraceIds.filter((id) => id !== m.terraceSourceId) }) : setDel(m), m)}
          </div>
        </div>
      </article>
  ));

  return (
    <Page>
      <PageHeader title={terrace ? 'Modeli ograda za terase' : 'Modeli ograda'}
        subtitle={terrace ? 'Ograde za terase, stepeništa i galerije, uključujući dvorišne modele označene za terase. Ograde za terase nemaju kapije.' : undefined}
        actions={<>{terrace && TERRACE_MODEL_LIST.some((m) => hiddenModels?.includes(m.id)) && <button className="btn" data-testid="restore-terrace-models" onClick={() => { const ids = new Set(TERRACE_MODEL_LIST.map((m) => m.id)); for (const id of ids) if (hiddenModels?.includes(id)) useAppStore.getState().restoreHiddenModels(id); }}>Vrati obrisane modele</button>}<button className="btn btn-primary" data-testid={terrace ? 'btn-create-terrace-model' : 'btn-create-model'} onClick={() => navigate(terrace ? `${drawPath}/${uid('cm')}` : drawPath)}><PencilRuler size={17} />Napravi model</button></>} />
      <div className="flex flex-wrap gap-3 mb-4" role="search">
        <input className="input flex-1 min-w-0" aria-label="Pretraga modela" placeholder="Pretraži modele…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input !w-auto" aria-label="Filter modela" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Svi modeli</option><option value="custom">Moji modeli</option><option value="catalog">Katalog</option><option value="shared">Dostupni i za terase</option></select>
      </div>
      {!terrace && <MultiSelect testId="terrace-model-picker" label="Modeli koji se koriste i za terase" values={terraceIds}
        options={allFenceModels(undefined, 'yard').map((m) => ({ value: m.id, label: m.name, testId: `terrace-use-${m.id}` }))}
        onChange={(terraceModelIds) => useAppStore.getState().updateSettings({ terraceModelIds })} />}
      {terrace && customCards.length > 0 && (
        <section className="mb-7" data-testid="custom-terrace-models">
          <h2 className="font-bold text-lg mb-3">Moje ograde za terase (ručno nacrtane)</h2>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {customCards}
          </div>
          <h2 className="font-bold text-lg mt-7 -mb-2">Modeli iz kataloga</h2>
        </section>
      )}
      {terrace && !cardModels.length && list.every((m) => hiddenModels?.includes(m.id)) && (
        <p className="text-sm text-muted card p-4" data-testid="terrace-models-empty">Svi modeli ograda za terase iz kataloga su obrisani. Vratite ih dugmetom „Vrati obrisane modele“ ili nacrtajte nov dugmetom „Napravi model“.</p>
      )}
      {!customCards.length && !shownCatalog.length && <p className="card p-4 text-sm text-muted" role="status">Nema modela koji odgovaraju pretrazi i filteru.</p>}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" data-testid={terrace ? 'terrace-models' : 'yard-models'}>
        {!terrace && customCards}
        {shownCatalog.map((m) => {
          // dorađen model koji zamenjuje original: kartica prikazuje dorađen crtež, uz mogućnost vraćanja originala
          const rep = customModels?.find((c) => c.replaces === m.id);
          if (rep) return (
            <article key={m.id} className="card overflow-hidden flex flex-col" data-testid={`model-card-${m.id}`} data-replaced="true">
              <div className="relative aspect-[16/10] bg-[#eef2f6] overflow-hidden border-b border-line p-3"><CustomModelThumb model={rep} materials={materials} /></div>
              <div className="p-4 flex-1 flex flex-col">
                <h2 className="min-h-[48px] line-clamp-2 font-bold text-[17px]">{m.name}</h2>
                <p className="text-sm text-muted mt-0.5">{m.description}</p>
              {terraceIds.includes(m.id) && <span className="text-xs font-semibold text-primary mt-1">Dostupan i za terase</span>}
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 mt-auto pt-4 [&>.btn]:whitespace-normal [&>.btn]:min-w-0">
                    <button className="btn flex-1 !px-2" data-testid={`rework-model-${m.id}`} onClick={() => navigate(`${drawPath}/${rep.id}`, { state: { dorada: true } })}><Wrench size={16} />Uredi model</button>
                    <button className="btn btn-primary flex-1 !px-2" data-testid={`use-model-${m.id}`} onClick={() => useModel(rep.id as FenceModelId)}>Koristi model</button>
                    {menu(rep.id, () => setDelBuiltin(m.id), rep)}
                </div>
              </div>
            </article>
          );
          return (
          <article key={m.id} className="card overflow-hidden flex flex-col" data-testid={`model-card-${m.id}`}>
            <div className="relative aspect-[16/10] bg-white overflow-hidden border-b border-line"><div className="absolute inset-0"><ModelThumb modelId={m.id} full /></div></div>
            <div className="p-4 flex-1 flex flex-col">
              <h2 className="min-h-[48px] line-clamp-2 font-bold text-[17px]">{m.name}</h2>
              <p className="text-sm text-muted mt-0.5">{m.description}</p>
              {terraceIds.includes(m.id) && <span className="text-xs font-semibold text-primary mt-1">Dostupan i za terase</span>}
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
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 mt-auto pt-4 [&>.btn]:whitespace-normal [&>.btn]:min-w-0">
                <button className="btn flex-1 !px-2" data-testid={`rework-model-${m.id}`} title="Otvara crtež modela u crtanju, gde se menja svaki deo" onClick={() => navigate(`${drawPath}/${useAppStore.getState().startDorada(m.id)}`, { state: { dorada: true } })}><Wrench size={16} />Uredi model</button>
                <button className="btn btn-primary flex-1 !px-2" data-testid={`use-model-${m.id}`} onClick={() => useModel(m.id)}>Koristi model</button>
                {menu(m.id, () => setDelBuiltin(m.id))}
              </div>
            </div>
          </article>
          );
        })}
      </div>
      {renaming && <Modal title="Preimenuj model" onClose={() => setRenaming(null)} footer={<button className="btn btn-primary" disabled={!renameName.trim()} onClick={() => { const st = useAppStore.getState(); st.updateSettings({ customModels: (st.settings.customModels ?? []).map((m) => m.id === renaming ? { ...m, name: renameName.trim(), updatedAt: new Date().toISOString() } : m) }); setRenaming(null); }}>Sačuvaj naziv</button>}><input autoFocus className="input" aria-label="Naziv modela" value={renameName} onChange={(e) => setRenameName(e.target.value)} /></Modal>}
      {del && <ConfirmDialog title="Brisanje modela" danger confirmLabel="Obriši" message={usedBy(del.id).length ? <>Model <b>{del.name}</b> koriste projekti: <b>{usedBy(del.id).join(', ')}</b>. Ako ga obrišete, ti projekti prelaze na podrazumevani model iz kataloga. Crtež se ne može vratiti.</> : <>Obrisati nacrtani model <b>{del.name}</b>? Crtež se ne može vratiti.</>} onCancel={() => setDel(null)} onConfirm={() => { useAppStore.getState().removeCustomModel(del.id); setDel(null); }} />}
      {delBuiltin && (
        <ConfirmDialog title="Brisanje modela" danger confirmLabel="Obriši"
          message={<>{usedBy(delBuiltin).length ? <>Model <b>{FENCE_MODELS[delBuiltin].name}</b> koriste projekti: <b>{usedBy(delBuiltin).join(', ')}</b>; oni ostaju isti. </> : <>Model <b>{FENCE_MODELS[delBuiltin].name}</b> se uklanja iz kataloga. </>}Obrisane modele možete vratiti dugmetom „Vrati obrisane modele“.</>}
          onCancel={() => setDelBuiltin(null)}
          onConfirm={() => { const rep = customModels?.find((c) => c.replaces === delBuiltin); if (rep) useAppStore.getState().removeCustomModel(rep.id); useAppStore.getState().hideModel(delBuiltin); setDelBuiltin(null); }} />
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
