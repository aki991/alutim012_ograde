import { Image as ImageIcon, Box, Columns2, Download, Eye, List, AlertTriangle, Loader2, PencilRuler, Save, Maximize2, Minimize2, Redo2, Ruler, ScanLine, SlidersHorizontal, Square, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { Component, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { DragSource, DragView, DropTarget } from '../../hooks/useDragController';
import type { Project } from '../../domain/models/types';
import { useAppStore, type EditorView } from '../../store/useAppStore';
import { saveNow } from '../../services/persistence';
import { exportSvg } from '../../services/exports';
import { BomTable, DimensionsTable } from './Tables';
import { FrontView, fitScale } from './FrontView';
import { TopView } from './TopView';
import { computePlan } from '../../domain/geometry/plan';
import { outerWidthMm } from '../../domain/geometry/layout';
import { traceToProject } from '../../domain/geometry/trace';
import { TraceCanvas } from './TraceCanvas';
import { PhotoSim } from './PhotoSim';
import { DimEditModal, type DimKind } from './DimEditModal';
import { AddItemModal } from './AddItemModal';

const Scene3D = lazy(() => import('./three/Scene3D'));
const BASE = 0.1; // px/mm pri zoomu 100%

interface Props {
  project: Project;
  svgRef: RefObject<SVGSVGElement | null>;
  areaRef: RefObject<HTMLDivElement | null>;
  drag: DragView | null;
  onBeginDrag: (source: DragSource, e: { clientX: number; clientY: number }) => void;
  registerTarget: (key: string, t: DropTarget | null) => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}

const TABS: { id: EditorView; label: string; icon: typeof Eye; desktopOnly?: boolean }[] = [
  { id: 'front', label: '2D prikaz', icon: Square },
  { id: 'top', label: 'Pogled odozgo', icon: ScanLine },
  { id: 'three', label: '3D prikaz', icon: Box },
  { id: 'split', label: '2D + 3D', icon: Columns2, desktopOnly: true },
  { id: 'dims', label: 'Dimenzije', icon: Ruler },
  { id: 'bom', label: 'Lista materijala', icon: List },
  { id: 'photo', label: 'Simulacija', icon: ImageIcon },
];

/** Greška u 3D delu (uvoz, inicijalizacija) ne sme srušiti editor — nudi ponovni pokušaj i povratak u 2D. */
class ThreeBoundary extends Component<{ children: ReactNode; onSwitchTo2D: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="h-full grid place-items-center p-6 text-center bg-slate-50" role="alert" data-testid="three-fallback">
        <div className="max-w-sm">
          <div className="font-semibold mb-1">3D prikaz nije mogao da se učita</div>
          <p className="text-sm text-muted mb-3">{this.state.error.message}. Projekat je sačuvan; nastavite u 2D prikazu ili pokušajte ponovo.</p>
          <div className="flex gap-2 justify-center">
            <button className="btn" onClick={() => this.setState({ error: null })} data-testid="three-retry">Pokušaj ponovo</button>
            <button className="btn btn-primary" onClick={this.props.onSwitchTo2D}>Nastavi u 2D</button>
          </div>
        </div>
      </div>
    );
  }
}

export function EditorCanvas({ project, svgRef, areaRef, drag, onBeginDrag, registerTarget, fullscreen, onToggleFullscreen }: Props) {
  const view = useAppStore((s) => s.editor.view);
  const zoom = useAppStore((s) => s.editor.zoom);
  const selection = useAppStore((s) => s.editor.selection);
  const multi = useAppStore((s) => s.editor.multi);
  const canUndo = useAppStore((s) => s.editor.history.past.length > 0);
  const canRedo = useAppStore((s) => s.editor.history.future.length > 0);
  const { setView, setZoom, select, toggleItem, selectItems, undo, redo, mutate } = useAppStore.getState();
  const [autoFit, setAutoFit] = useState(true);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsRef = useRef<HTMLSpanElement>(null);
  // meni opcija prikaza se zatvara klikom bilo gde van njega
  useEffect(() => {
    if (!optionsOpen) return;
    const close = (e: PointerEvent) => { if (!optionsRef.current?.contains(e.target as Node)) setOptionsOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [optionsOpen]);
  const [tracing, setTracing] = useState(false);
  const photoSimEnabled = useAppStore((s) => s.settings.photoSimEnabled !== false);
  // isključena simulacija: tab se sklanja, a otvoren prikaz se vraća na 2D
  useEffect(() => { if (!photoSimEnabled && view === 'photo') setView('front'); }, [photoSimEnabled, view, setView]);
  const advancedLengths = useAppStore((s) => Boolean(s.settings.advancedLengths));
  const saveStatus = useAppStore((s) => s.saveStatus);
  const saveError = useAppStore((s) => s.saveError);
  const [saveClicked, setSaveClicked] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [dimEdit, setDimEdit] = useState<{ id: string; kind: DimKind } | null>(null);
  const activeModelId = useAppStore((s) => s.editor.activeModelId);
  const panRef = useRef<{ x: number; y: number; sl: number; st: number; moved: boolean } | null>(null);
  const justPanned = useRef(false);
  // okvir za izbor više polja (koordinate ekrana) i taster Razmaknica (pomeranje prikaza levim tasterom)
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const spaceDown = useRef(false);
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !typing(e.target)) spaceDown.current = true; };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') spaceDown.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const s = project.settings;
  const scale = zoom * BASE;
  const show2D = view === 'front' || view === 'top' || view === 'split';
  const show3D = view === 'three' || view === 'split';
  const paneHeight = 'h-[clamp(300px,46vh,520px)]';

  const doFit = useCallback(() => {
    const el = areaRef.current;
    if (!el) return;
    let sc = fitScale(project, el.clientWidth, el.clientHeight, s.showDimensions);
    if (view === 'top') {
      const pl = computePlan(project);
      const swing = Math.max(1200, ...project.items.filter((i) => i.kind === 'gate').map((i) => i.widthMm));
      const wMm = pl.maxX - pl.minX + 400 + (pl.turned ? 2 * swing : 0);
      const hMm = pl.maxZ - pl.minZ + 2 * swing + 1000;
      sc = Math.min(0.5, Math.max(0.02, Math.min((el.clientWidth - 24) / wMm, (el.clientHeight - 24) / hMm)));
    }
    sc = sc || 0.1;
    useAppStore.getState().setZoom(sc / BASE);
  }, [areaRef, project, s.showDimensions, view]);

  // automatsko uklapanje dok korisnik ručno ne zumira
  useLayoutEffect(() => {
    if (autoFit && show2D) doFit();
  }, [autoFit, doFit, show2D, fullscreen, view]);
  useEffect(() => {
    const el = areaRef.current;
    if (!el || !autoFit || !show2D) return;
    const ro = new ResizeObserver(() => doFit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [areaRef, autoFit, doFit, show2D, view, tracing]);

  // 2D površina je meta za ispuštanje elemenata iz kataloga i promenu redosleda
  useEffect(() => {
    const el = areaRef.current;
    if (!show2D || !el) { registerTarget('2d', null); return; }
    registerTarget('2d', {
      el,
      toMm: (cx, cy) => {
        const svg = svgRef.current;
        const ctm = svg?.getScreenCTM();
        if (!svg || !ctm) return null;
        const pt = svg.createSVGPoint();
        pt.x = cx; pt.y = cy;
        return pt.matrixTransform(ctm.inverse()).x;
      },
    });
    return () => registerTarget('2d', null);
  }, [show2D, view, tracing, areaRef, svgRef, registerTarget]);

  const zoomBy = (f: number) => { setAutoFit(false); setZoom(zoom * f); };

  // Ctrl + točkić = zumiranje
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setAutoFit(false);
      useAppStore.getState().setZoom(useAppStore.getState().editor.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [areaRef, view, tracing]);

  const onPointerDown = (e: React.PointerEvent) => {
    justPanned.current = false;
    const t = e.target as Element;
    const hit = t.closest('[data-hit]') as SVGElement | null;
    if (hit && e.button === 0) {
      const id = hit.getAttribute('data-id')!;
      if (hit.getAttribute('data-hit') === 'item') {
        const idx = project.items.findIndex((i) => i.id === id);
        if (e.ctrlKey || e.metaKey) {
          // Ctrl+klik: dodaje polje u izbor ili ga izbacuje; bez prevlačenja
          toggleItem(id);
          window.dispatchEvent(new CustomEvent('open-props'));
          return;
        }
        if (e.shiftKey && selection?.type === 'item') {
          // Shift+klik: sva polja od izabranog do kliknutog
          const from = project.items.findIndex((i) => i.id === selection.id);
          const [a, b] = from <= idx ? [from, idx] : [idx, from];
          if (from >= 0) { selectItems(project.items.slice(a, b + 1).map((i) => i.id)); window.dispatchEvent(new CustomEvent('open-props')); return; }
        }
        select({ type: 'item', id });
        window.dispatchEvent(new CustomEvent('open-props'));
        onBeginDrag({ kind: 'move', id, label: `${idx + 1}. element · ${Math.round(outerWidthMm(project, idx))} mm` }, e);
      } else {
        select({ type: 'post', id });
        window.dispatchEvent(new CustomEvent('open-props'));
      }
      return;
    }
    // levi taster na pozadini 2D prikaza crta okvir za izbor polja; Ctrl dodaje na postojeći izbor
    if (e.pointerType === 'mouse' && e.button === 0 && view !== 'top' && !spaceDown.current && areaRef.current) {
      const x0 = e.clientX;
      const y0 = e.clientY;
      const add = e.ctrlKey || e.metaKey;
      let active = false;
      const rectOf = (ev: PointerEvent) => ({ x0, y0, x1: ev.clientX, y1: ev.clientY });
      const move = (ev: PointerEvent) => {
        if (!active && Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) > 4) active = true;
        if (active) setMarquee(rectOf(ev));
      };
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setMarquee(null);
        if (!active) return; // običan klik: ponaša se kao klik na pozadinu
        justPanned.current = true; // posle okvira sledi klik koji ne sme da poništi izbor
        const r = rectOf(ev);
        const l = Math.min(r.x0, r.x1); const rt = Math.max(r.x0, r.x1); const t = Math.min(r.y0, r.y1); const b = Math.max(r.y0, r.y1);
        const ids: string[] = [];
        areaRef.current?.querySelectorAll('[data-hit="item"]').forEach((el) => {
          const bb = el.getBoundingClientRect();
          if (bb.right >= l && bb.left <= rt && bb.bottom >= t && bb.top <= b) ids.push(el.getAttribute('data-id')!);
        });
        if (ids.length) { selectItems(ids, add); window.dispatchEvent(new CustomEvent('open-props')); }
        else if (!add) select(null);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      return;
    }
    // pan: srednji taster, Razmaknica + levi taster (ili levi taster u pogledu odozgo); na dodir radi prirodno skrolovanje
    if (e.pointerType === 'mouse' && (e.button === 0 || e.button === 1) && areaRef.current) {
      const a = areaRef.current;
      panRef.current = { x: e.clientX, y: e.clientY, sl: a.scrollLeft, st: a.scrollTop, moved: false };
      const move = (ev: PointerEvent) => {
        const p = panRef.current;
        if (!p) return;
        const dx = ev.clientX - p.x;
        const dy = ev.clientY - p.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) p.moved = true;
        a.scrollLeft = p.sl - dx;
        a.scrollTop = p.st - dy;
      };
      const up = () => {
        justPanned.current = Boolean(panRef.current?.moved);
        panRef.current = null;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }
  };

  // pritisak na element koji pomeri raspored (otvaranje panela svojstava) ne sme da se završi kao klik na pozadinu
  const downOnHit = useRef(false);
  const onClickBackground = (e: React.MouseEvent) => {
    if (downOnHit.current) { downOnHit.current = false; return; }
    if ((e.target as Element).closest('[data-add]') && !justPanned.current) { setAddOpen(true); return; }
    const dim = (e.target as Element).closest('[data-dim]');
    if (dim && !justPanned.current) { setDimEdit({ id: dim.getAttribute('data-id')!, kind: dim.getAttribute('data-dim') as DimKind }); return; }
    if ((e.target as Element).closest('[data-hit]')) return;
    if (justPanned.current) { justPanned.current = false; return; }
    select(null);
  };

  const toggleOpt = (key: 'showDimensions' | 'showGrid' | 'showLabels') => mutate((p) => ({ ...p, settings: { ...p.settings, [key]: !p.settings[key] } }));

  const dragging = drag?.active ? drag : null;
  const dimmedId = dragging?.source.kind === 'move' ? dragging.source.id : null;
  const dropLabel = dragging?.source.kind === 'new' ? 'Ubaci ovde' : 'Premesti ovde';
  const empty = project.items.length === 0;

  const finishTrace = (points: Parameters<typeof traceToProject>[1]) => {
    let result: ReturnType<typeof traceToProject> | null = null;
    mutate((p) => { result = traceToProject(p, points, activeModelId); return result.project; });
    const r = result as ReturnType<typeof traceToProject> | null;
    setTracing(false);
    select(null);
    setAutoFit(true);
    setView('top');
    if (r && r.warnings.length) useAppStore.getState().setNotice(r.warnings.join(' '));
  };

  const area2D = tracing ? (
    <div className="h-[clamp(420px,68vh,760px)] bg-white" data-testid="trace-pane">
      <TraceCanvas modelId={activeModelId} onModel={(m) => useAppStore.getState().setActiveModel(m)} onFinish={finishTrace} onCancel={() => setTracing(false)} />
    </div>
  ) : (
    <div
      ref={areaRef}
      data-testid="canvas-area"
      className={`relative overflow-auto scroll-thin bg-white ${paneHeight} ${view === 'top' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
      onPointerDownCapture={(e) => { downOnHit.current = Boolean((e.target as Element).closest('[data-hit]')); }}
      onPointerDown={onPointerDown}
      onClick={onClickBackground}
    >
      <div style={{ display: 'flex', minWidth: 'max-content', minHeight: '100%', alignItems: 'center', justifyContent: 'center' }}>
        {view === 'top' ? (
          <div ref={(el) => { (svgRef as { current: SVGSVGElement | null }).current = (el?.querySelector('svg') as SVGSVGElement) ?? null; }}>
            <TopView project={project} scale={scale} selectedId={selection?.type === 'item' ? selection.id : null} selectedPostId={selection?.type === 'post' ? selection.id : null} onSelect={(id) => select({ type: 'item', id })} onSelectPost={(id) => select({ type: 'post', id })} />
          </div>
        ) : (
          <div ref={(el) => { (svgRef as { current: SVGSVGElement | null }).current = (el?.querySelector('svg') as SVGSVGElement) ?? null; }}>
            <FrontView
              project={project}
              scale={scale}
              selectedId={selection?.id ?? null}
              selectedType={selection?.type ?? null}
              selectedIds={multi}
              dimmedId={dimmedId}
              dropIndex={dragging?.indicatorPost ?? null}
              dropLabel={dropLabel}
              options={{ showModular: advancedLengths }}
              interactive
            />
          </div>
        )}
      </div>
      {marquee && (
        <div data-testid="marquee" className="fixed z-40 pointer-events-none border border-primary bg-primary/10 rounded-sm" style={{ left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) }} />
      )}
      {empty && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none" data-testid="empty-state">
          <div className="text-center max-w-[360px] px-4 py-5 rounded-2xl bg-white/90 border border-dashed border-slate-300">
            <div className="font-semibold text-[16px]">Prazan projekat</div>
            <p className="text-sm text-muted mt-1">Dodajte element iz kataloga da započnete projekat — kliknite „Dodaj" ili ga prevucite na crtež.</p>
          </div>
        </div>
      )}
    </div>
  );

  const area3D = (
    <div className={`${paneHeight} relative bg-[#eef2f6]`} data-testid="three-pane">
      <ThreeBoundary onSwitchTo2D={() => setView('front')}>
        <Suspense fallback={<div className="h-full grid place-items-center text-muted text-sm" data-testid="three-loading">Učitavanje 3D prikaza…</div>}>
          <Scene3D project={project} drag={drag} onBeginDrag={onBeginDrag} registerTarget={registerTarget} targetKey="3d" onSwitchTo2D={() => setView('front')} />
        </Suspense>
      </ThreeBoundary>
    </div>
  );

  return (
    <section className="card overflow-hidden" data-testid="canvas-card">
      <div className="flex flex-wrap items-center gap-2 px-3 pt-2 border-b border-line">
        <div className="flex gap-1 overflow-x-auto overflow-y-hidden scroll-thin" role="tablist" aria-label="Prikazi">
          {TABS.filter((t) => t.id !== 'photo' || photoSimEnabled).map((t) => {
            const active = t.id === view;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                data-testid={`tab-${t.id}`}
                onClick={() => setView(t.id)}
                className={`${t.desktopOnly ? 'hidden lg:flex' : 'flex'} items-center gap-2 px-3.5 py-2.5 text-[14px] font-medium border-b-2 whitespace-nowrap ${active ? 'border-primary text-primary' : 'border-transparent text-slate-600 hover:text-ink'}`}
              >
                <t.icon size={17} />{t.label}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-1 pb-1.5 relative">
          {show2D && <button className="btn btn-sm btn-accent" data-testid="btn-trace" title="Nacrtajte trasu ograde tačku po tačku" aria-pressed={tracing} onClick={() => { if (!tracing) setView(view === 'split' ? 'split' : 'top'); setTracing((t) => !t); }}><PencilRuler size={15} />Nacrtaj ogradu</button>}
          <button
            className={`btn btn-sm ${saveStatus === 'error' ? 'btn-danger' : ''}`}
            data-testid="btn-save" data-state={saveStatus} disabled={saveClicked}
            title={saveStatus === 'error' ? `Greška pri čuvanju: ${saveError ?? ''}` : 'Sačuvaj projekat'}
            aria-busy={saveClicked}
            onClick={() => { setSaveClicked(true); const started = Date.now(); void saveNow().finally(() => window.setTimeout(() => setSaveClicked(false), Math.max(0, 450 - (Date.now() - started)))); }}
          >
            {saveClicked ? <Loader2 size={15} className="animate-spin" /> : saveStatus === 'error' ? <AlertTriangle size={15} /> : <Save size={15} />}
            {saveClicked ? 'Čuvanje' : saveStatus === 'error' ? 'Greška' : 'Sačuvaj'}
          </button>
          <button className="btn btn-icon" aria-label="Poništi (Ctrl+Z)" title="Poništi (Ctrl+Z)" disabled={!canUndo} data-testid="btn-undo" onClick={undo}><Undo2 size={17} /></button>
          <button className="btn btn-icon" aria-label="Ponovi (Ctrl+Shift+Z)" title="Ponovi (Ctrl+Shift+Z)" disabled={!canRedo} data-testid="btn-redo" onClick={redo}><Redo2 size={17} /></button>
          {show2D && (
            <>
              <span className="w-px h-6 bg-line mx-1" />
              <button className="btn btn-icon" aria-label="Smanji (zoom out)" title="Zoom out" onClick={() => zoomBy(1 / 1.25)} data-testid="btn-zoom-out"><ZoomOut size={17} /></button>
              <button className="btn btn-sm min-w-[58px] tabular-nums" aria-label="Resetuj zoom na 100%" title="Reset zoom (100%)" data-testid="zoom-level" onClick={() => { setAutoFit(false); setZoom(1); }}>{Math.round(zoom * 100)}%</button>
              <button className="btn btn-icon" aria-label="Uvećaj (zoom in)" title="Zoom in" onClick={() => zoomBy(1.25)} data-testid="btn-zoom-in"><ZoomIn size={17} /></button>
              <button className="btn btn-icon" aria-label="Uklopi u ekran" title="Uklopi u ekran (Fit)" onClick={() => { setAutoFit(true); doFit(); }} data-testid="btn-fit"><ScanLine size={17} /></button>
            </>
          )}
          <button className="btn btn-icon" aria-label={fullscreen ? 'Izađi iz punog ekrana' : 'Pun ekran'} title="Pun ekran" onClick={onToggleFullscreen} data-testid="btn-fullscreen">{fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
          <span ref={optionsRef} className="contents">
          {show2D && <button className="btn btn-icon" aria-label="Opcije prikaza" aria-expanded={optionsOpen} title="Opcije prikaza" onClick={() => setOptionsOpen((o) => !o)} data-testid="btn-view-options"><SlidersHorizontal size={17} /></button>}
          {optionsOpen && show2D && (
            <div className="absolute right-0 top-full mt-1 w-56 card p-2 z-30" role="menu">
              {([['showDimensions', 'Prikaži kote'], ['showGrid', 'Prikaži mrežu'], ['showLabels', 'Prikaži oznake elemenata']] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={s[k]} onChange={() => toggleOpt(k)} data-testid={`opt-${k}`} />{label}
                </label>
              ))}
              <button className="btn btn-sm w-full mt-1" onClick={() => { void exportSvg(project); setOptionsOpen(false); }} data-testid="btn-export-svg"><Download size={15} />Izvezi SVG</button>
            </div>
          )}
          </span>
        </div>
      </div>

      {view === 'split' ? (
        <div className="grid lg:grid-cols-2 divide-x divide-line">{area2D}{area3D}</div>
      ) : show2D ? area2D : show3D ? area3D : null}
      {view === 'dims' && <div className={`${paneHeight} overflow-auto scroll-thin`}><DimensionsTable project={project} /></div>}
      {view === 'photo' && photoSimEnabled && <div className="h-[clamp(420px,62vh,720px)]" data-testid="photo-pane"><PhotoSim project={project} /></div>}
      {view === 'bom' && <div className={`${paneHeight} overflow-auto scroll-thin`}><BomTable project={project} /></div>}
      {addOpen && <AddItemModal project={project} onClose={() => setAddOpen(false)} />}
      {dimEdit && <DimEditModal project={project} id={dimEdit.id} kind={dimEdit.kind} onClose={() => setDimEdit(null)} />}
    </section>
  );
}
