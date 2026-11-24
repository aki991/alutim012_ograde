import { ChevronDown, Pencil, Plus, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Catalog } from '../../components/editor/Catalog';
import { CalcModal } from '../../components/editor/CalcModal';
import { EditorCanvas } from '../../components/editor/EditorCanvas';
import { PropertiesPanel } from '../../components/editor/PropertiesPanel';
import { projectModelId } from '../../domain/models/catalog';
import { newItemFor } from '../../domain/geometry/newItem';
import { insertItem, moveItem, setOuterWidth, withConcretePosts } from '../../domain/geometry/operations';
import { useDragController, type DragSource, type DropTarget } from '../../hooks/useDragController';
import { useAppStore, useCurrentProject } from '../../store/useAppStore';

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

function EditorWorkspace({ navigateAway }: { navigateAway: () => void }) {
  void navigateAway;
  const project = useCurrentProject()!;
  const customers = useAppStore((s) => s.customers);
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
  const [propsOpen, setPropsOpen] = useState(() => window.innerWidth >= 1280);
  const [catalogOpen, setCatalogOpen] = useState(true);

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
    const openProps = () => setPropsOpen(true);
    window.addEventListener('open-props', openProps);
    window.addEventListener('open-project-props', openProps);
    return () => { window.removeEventListener('open-props', openProps); window.removeEventListener('open-project-props', openProps); };
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
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 max-w-[1920px] mx-auto">
        <div className="min-w-0"><h1 className="font-bold text-[17px] truncate">{project.name}</h1><span className="text-[12px] text-muted">{customer?.name ?? 'Kupac nije izabran'}</span></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" data-testid="project-edit" onClick={() => window.dispatchEvent(new CustomEvent('open-project-props'))}><Pencil size={14} />Podaci o projektu</button>
          <button type="button" className={`btn btn-sm ${catalogOpen ? 'bg-slate-100' : ''}`} data-testid="toggle-catalog" aria-expanded={catalogOpen} aria-controls="project-catalog" onClick={() => setCatalogOpen((v) => !v)}><Plus size={16} />{catalogOpen ? 'Sakrij elemente' : 'Prikaži elemente'}<ChevronDown size={14} className={catalogOpen ? 'rotate-180' : ''} /></button>
          <button type="button" className="btn btn-sm" aria-expanded={propsOpen} aria-controls="project-properties" data-testid="toggle-props" onClick={() => setPropsOpen((v) => !v)}><SlidersHorizontal size={16} />{propsOpen ? 'Sakrij svojstva' : 'Svojstva'}</button>
        </div>
      </div>
      <div className={`grid gap-4 ${propsOpen ? 'lg:grid-cols-[minmax(0,1fr)_320px]' : ''} max-w-[1920px] mx-auto`} data-props-open={propsOpen}>
        <div className="min-w-0 space-y-4">
          {fullscreen && <button className="btn btn-sm" onClick={toggleFullscreen}><X size={14} />Zatvori pun ekran</button>}
          <EditorCanvas project={project} svgRef={svgRef} areaRef={areaRef} drag={drag} onBeginDrag={begin} registerTarget={registerTarget} fullscreen={fullscreen} onToggleFullscreen={toggleFullscreen} />
          <div id="project-catalog" hidden={!catalogOpen}><Catalog onBeginDrag={begin} /></div>
        </div>

        <div id="project-properties" className={propsOpen ? 'min-w-0' : 'hidden'}>
          <div
            data-testid="props-drawer"
            role={propsOpen ? 'complementary' : undefined}
            aria-label="Svojstva"
            className={propsOpen
              ? 'fixed z-[70] bottom-0 inset-x-0 max-h-[78vh] sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[340px] sm:max-h-none overflow-auto scroll-thin bg-bg p-3 shadow-2xl border-t sm:border-l border-line lg:static lg:z-auto lg:w-auto lg:max-h-[calc(100vh-96px)] lg:sticky lg:top-3 lg:p-0 lg:shadow-none lg:border-0 lg:bg-transparent'
              : 'hidden'}
          >
            <div className="flex items-center justify-between mb-3">
              <b className="text-[15px]">Svojstva</b>
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
