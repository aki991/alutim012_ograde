import { Pencil, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Catalog } from '../../components/editor/Catalog';
import { CalcModal } from '../../components/editor/CalcModal';
import { EditorCanvas } from '../../components/editor/EditorCanvas';
import { PropertiesPanel } from '../../components/editor/PropertiesPanel';
import { Field, SelectField, TextField } from '../../components/forms/Fields';
import { Modal } from '../../components/ui/Modal';
import { STATUS_LABELS, projectModelId } from '../../domain/models/catalog';
import { newItemFor } from '../../domain/geometry/newItem';
import { insertItem, moveItem, setOuterWidth, withConcretePosts } from '../../domain/geometry/operations';
import type { ProjectStatus } from '../../domain/models/types';
import { useDragController, type DragSource, type DropTarget } from '../../hooks/useDragController';
import { useAppStore, useCurrentProject } from '../../store/useAppStore';
import { fmtDate } from '../../utils/units';

export default function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const projects = useAppStore((s) => s.projects);
  const currentId = useAppStore((s) => s.editor.projectId);
  const openProject = useAppStore((s) => s.openProject);
  const project = useCurrentProject();

  // sinhronizacija rute sa izabranim projektom
  useEffect(() => {
    if (id && projects.some((p) => p.id === id)) openProject(id);
  }, [id, projects, openProject]);

  if (!id) {
    const target = (currentId && projects.some((p) => p.id === currentId) ? currentId : projects[0]?.id) ?? null;
    if (target) return <Navigate to={`/editor/${target}`} replace />;
    return <NoProject />;
  }
  if (!projects.some((p) => p.id === id)) return <NoProject missing />;
  if (!project || project.id !== id) return <div className="p-6 text-muted">Učitavanje projekta...</div>;
  return <EditorWorkspace key={project.id} navigateAway={() => navigate('/projekti')} />;
}

function NoProject({ missing }: { missing?: boolean }) {
  const newProject = useAppStore((s) => s.newProject);
  const navigate = useNavigate();
  return (
    <div className="p-10 max-w-lg mx-auto text-center">
      <h1 className="text-xl font-bold mb-2">{missing ? 'Projekat nije pronađen' : 'Nema projekata'}</h1>
      <p className="text-muted mb-4">{missing ? 'Projekat možda je obrisan.' : 'Napravite prvi projekat da biste počeli sa projektovanjem.'}</p>
      <div className="flex gap-2 justify-center">
        <button className="btn btn-primary" onClick={() => navigate(`/editor/${newProject()}`)}>Novi projekat</button>
        <Link to="/projekti" className="btn">Svi projekti</Link>
      </div>
    </div>
  );
}

/** Traka za uređivanje modela kapije: sačuvaj kao prepravku modela ili kao nov model, odnosno odustani. */
function GateModelBanner({ project }: { project: NonNullable<ReturnType<typeof useCurrentProject>> }) {
  const navigate = useNavigate();
  const models = useAppStore((s) => s.settings.gateModels);
  const base = project.modelDraft?.modelId ? models?.find((m) => m.id === project.modelDraft!.modelId) : undefined;
  const [name, setName] = useState(base?.name ?? '');
  const done = (id: string | null) => { if (id) navigate('/modeli-kapija'); };
  return (
    <div className="card p-3 mb-3 flex flex-wrap items-center gap-2 border-primary" data-testid="gate-model-banner">
      <b className="text-[14px]">{base ? `Uređujete model kapije „${base.name}“ (v${base.version})` : 'Pravite nov model kapije'}</b>
      <span className="text-[12.5px] text-muted">Podesite kapiju i njene mere u „Mere kapije“, pa sačuvajte model.</span>
      <input className="input !w-auto !py-1.5 min-w-[220px]" data-testid="gate-model-name-input" aria-label="Naziv modela kapije" placeholder="Naziv modela kapije" value={name} onChange={(e) => setName(e.target.value)} />
      {base && <button className="btn btn-primary" data-testid="gate-model-save" onClick={() => done(useAppStore.getState().commitGateModelEdit('overwrite', name || base.name))}>Sačuvaj prepravku modela</button>}
      <button className={`btn ${base ? '' : 'btn-primary'}`} data-testid="gate-model-save-new" disabled={!name.trim()} onClick={() => done(useAppStore.getState().commitGateModelEdit('new', name))}>Sačuvaj kao nov model</button>
      <button className="btn" data-testid="gate-model-discard" onClick={() => { useAppStore.getState().discardGateModelEdit(project.id); navigate('/modeli-kapija'); }}>Odustani</button>
    </div>
  );
}

function EditorWorkspace({ navigateAway }: { navigateAway: () => void }) {
  void navigateAway;
  const project = useCurrentProject()!;
  const customers = useAppStore((s) => s.customers);
  const selection = useAppStore((s) => s.editor.selection);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const targets = useRef<Record<string, DropTarget>>({});
  const registerTarget = useCallback((key: string, t: DropTarget | null) => {
    if (t) targets.current[key] = t;
    else delete targets.current[key];
  }, []);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [propsOpen, setPropsOpen] = useState(false);
  const [editData, setEditData] = useState(false);

  const { drag, begin } = useDragController({
    project,
    getTargets: () => Object.values(targets.current),
    onDrop: (source: DragSource, toIndex: number) => {
      const st = useAppStore.getState();
      if (source.kind === 'move') {
        st.mutate((p) => moveItem(p, source.id, toIndex));
        return;
      }
      const cur = st.projects.find((p) => p.id === st.editor.projectId);
      if (!cur) return;
      const model = projectModelId(cur.items) ?? st.editor.activeModelId;
      // novi element ima mere i izgled ograde koja je već u projektu
      const sel = st.editor.selection;
      const { item, outerWidthMm: outer } = newItemFor(cur, source.spec, model, sel?.type === 'item' ? sel.id : null);
      st.mutate((p) => { const q = insertItem(p, item, toIndex); return item.kind === 'opening' && item.bendDeg !== undefined ? q : setOuterWidth(source.spec.kind === 'gate' && source.spec.concrete ? withConcretePosts(q, item.id) : q, item.id, outer); });
      st.select({ type: 'item', id: item.id });
    },
  });

  // tastaturne prečice
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (document.querySelector('[role="dialog"]')) return; // otvoren modal: prečice editora su isključene
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      const st = useAppStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); st.redo(); return; }
      if (typing) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { if (st.editor.selection?.type === 'item') { e.preventDefault(); st.deleteSelected(); } }
      else if (e.key === 'Escape') st.select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    // klik na element otvara panel svojstava; na užim ekranima kao fioka
    const openProps = () => { if (window.innerWidth < 1280) setPropsOpen(true); };
    window.addEventListener('open-props', openProps);
    return () => window.removeEventListener('open-props', openProps);
  }, []);

  useEffect(() => {
    const open = () => setCalcOpen(true);
    window.addEventListener('open-calc', open);
    return () => window.removeEventListener('open-calc', open);
  }, []);

  const toggleFullscreen = useCallback(() => {
    setFullscreen((f) => {
      const next = !f;
      try {
        if (next) void document.documentElement.requestFullscreen?.().catch(() => undefined);
        else if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      } catch { /* pun ekran nije podržan — koristi se CSS prikaz */ }
      return next;
    });
  }, []);
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setFullscreen(false); };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const customer = customers.find((c) => c.id === project.customerId);

  return (
    <div ref={workspaceRef} className={fullscreen ? 'fixed inset-0 z-[80] bg-bg overflow-auto p-3' : 'p-3 sm:p-5'} data-testid="editor" data-fullscreen={fullscreen}>
      <div className="md:hidden portrait:flex items-center gap-2 text-[12px] bg-primary-50 text-primary-600 rounded-lg px-3 py-2 mb-3 hidden">Za lakše uređivanje preporučujemo horizontalni (landscape) prikaz telefona.</div>
      {editData && (
        <Modal title="Podaci o projektu / kupcu" onClose={() => setEditData(false)} footer={<button className="btn btn-primary" data-testid="project-edit-done" onClick={() => setEditData(false)}>Gotovo</button>}>
          <TextField label="Naziv projekta" value={project.name} testId="edit-name" onChange={(v) => useAppStore.getState().mutate((p) => ({ ...p, name: v, updatedAt: new Date().toISOString() }), 'name')} />
          <SelectField label="Kupac" testId="edit-customer" value={project.customerId ?? ''} options={[{ value: '', label: '— nije izabran —' }, ...customers.map((c) => ({ value: c.id, label: c.name }))]}
            onChange={(v) => useAppStore.getState().mutate((p) => ({ ...p, customerId: v || null, updatedAt: new Date().toISOString() }))} />
          <SelectField label="Status" testId="edit-status" value={project.status} options={(Object.keys(STATUS_LABELS) as ProjectStatus[]).map((v) => ({ value: v, label: STATUS_LABELS[v] }))}
            onChange={(v) => useAppStore.getState().mutate((p) => ({ ...p, status: v, updatedAt: new Date().toISOString() }))} />
          <TextField label="Broj ponude" value={project.quoteNo} testId="edit-quote" onChange={(v) => useAppStore.getState().mutate((p) => ({ ...p, quoteNo: v, updatedAt: new Date().toISOString() }), 'quote')} />
          <TextField label="Napomena" multiline value={project.notes} testId="edit-notes" onChange={(v) => useAppStore.getState().mutate((p) => ({ ...p, notes: v, updatedAt: new Date().toISOString() }), 'notes')} />
        </Modal>
      )}
      <div className={`grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] max-w-[1600px] mx-auto ${propsOpen ? 'sm:pr-[406px] xl:pr-0' : ''}`} data-props-open={propsOpen}>
        <div className="min-w-0 space-y-4">
          {project.modelDraft && <GateModelBanner project={project} />}
          {fullscreen && <button className="btn btn-sm" onClick={toggleFullscreen}><X size={14} />Zatvori pun ekran</button>}
          <EditorCanvas project={project} svgRef={svgRef} areaRef={areaRef} drag={drag} onBeginDrag={begin} registerTarget={registerTarget} fullscreen={fullscreen} onToggleFullscreen={toggleFullscreen} />
          {!project.modelDraft && <Catalog onBeginDrag={begin} />}
          <div className="grid gap-4">
            {!project.modelDraft && <section className="card p-4 min-w-0" data-testid="project-data">
              <div className="flex items-center justify-between mb-2"><h3 className="font-bold text-[15px]">Podaci o projektu / kupcu</h3>
                <button className="text-sm text-primary font-medium inline-flex items-center gap-1 hover:underline" data-testid="project-edit" onClick={() => setEditData(true)}><Pencil size={13} />Uredi</button></div>
              <SelectField label="Kupac" testId="project-customer" value={project.customerId ?? ''} options={[{ value: '', label: '— nije izabran —' }, ...customers.map((c) => ({ value: c.id, label: c.name }))]}
                onChange={(v) => useAppStore.getState().mutate((p) => ({ ...p, customerId: v || null, updatedAt: new Date().toISOString() }))} />
              {customer && <div className="text-[12.5px] text-muted pb-1">{customer.address} · {customer.phone}</div>}
              <SelectField label="Status" testId="project-status" value={project.status} options={(Object.keys(STATUS_LABELS) as ProjectStatus[]).map((v) => ({ value: v, label: STATUS_LABELS[v] }))}
                onChange={(v) => useAppStore.getState().mutate((p) => ({ ...p, status: v, updatedAt: new Date().toISOString() }))} />
              <Field label="Datum"><span className="text-sm">{fmtDate(project.updatedAt)}</span></Field>
              <Field label="Broj ponude"><span className="text-sm">{project.quoteNo || '—'}</span></Field>
              <TextField label="Napomena" multiline value={project.notes} testId="project-notes" onChange={(v) => useAppStore.getState().mutate((p) => ({ ...p, notes: v, updatedAt: new Date().toISOString() }), 'notes')} />
            </section>}
          </div>
        </div>

        <div className="min-w-0">
          {/* dugme za otvaranje panela samo na užim ekranima; na širokim je panel uvek otvoren (.btn bi nadjačao xl:hidden, zato omotač) */}
          <div className="xl:hidden mb-3">
            <button className="btn w-full" aria-expanded={propsOpen} data-testid="toggle-props" onClick={() => setPropsOpen((o) => !o)}>
              <SlidersHorizontal size={16} />{propsOpen ? 'Sakrij svojstva' : `Svojstva${selection ? ' (izabran element)' : ''}`}
            </button>
          </div>
          <div
            data-testid="props-drawer"
            role={propsOpen ? 'complementary' : undefined}
            aria-label="Svojstva"
            className={propsOpen
              ? 'fixed z-[70] bottom-0 inset-x-0 max-h-[78vh] sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[390px] sm:max-h-none overflow-auto scroll-thin bg-bg p-3 shadow-2xl border-t sm:border-l border-line xl:static xl:z-auto xl:w-auto xl:max-h-[calc(100vh-96px)] xl:sticky xl:top-3 xl:p-0 xl:shadow-none xl:border-0 xl:bg-transparent'
              : 'hidden xl:block xl:sticky xl:top-3 xl:max-h-[calc(100vh-96px)] xl:overflow-auto scroll-thin'}
          >
            <div className="flex items-center justify-between mb-3 xl:hidden">
              <b className="text-[15px]">Svojstva{selection ? ' — izabran element' : ''}</b>
              <button className="btn btn-sm" onClick={() => setPropsOpen(false)} data-testid="close-props" aria-label="Zatvori panel svojstava"><X size={14} />Zatvori</button>
            </div>
            <PropertiesPanel project={project} />
          </div>
        </div>
      </div>

      {/* duh prevlačenja */}
      {drag?.active && (
        <div className="fixed z-[200] pointer-events-none px-3 py-1.5 rounded-lg bg-primary text-white text-[13px] font-semibold shadow-xl" style={{ left: drag.x + 14, top: drag.y + 14, opacity: drag.toIndex === null ? 0.55 : 1 }} data-testid="drag-ghost">
          {drag.source.label}{drag.toIndex === null ? ' — prevucite na crtež' : ''}
        </div>
      )}
      {calcOpen && <CalcModal project={project} onClose={() => setCalcOpen(false)} />}
    </div>
  );
}
