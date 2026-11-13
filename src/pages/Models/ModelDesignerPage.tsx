import { AlertTriangle, ArrowLeft, Copy, Download, FileText, Link2, Link2Off, MousePointer2, Redo2, Rows3, Search, Trash2, Undo2, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Designer2D } from '../../components/designer/Designer2D';
import { GuideSection } from '../../components/designer/GuideSection';
import { SketchSvg } from '../../components/designer/Sketch';
import { downloadSketchPdf, downloadSketchSvg } from '../../services/pdfSketch';
import { resolveParts, ShapeIcon } from '../../components/designer/PartsSvg';
import { RAL_COLORS } from '../../domain/models/catalog';
import { CUSTOM_KIND_LABELS, customBom, newCustomModel, repeatPart, type CustomModel, type CustomPart } from '../../domain/models/custom';
import { applyGuides, attachToGuides, barLayoutInfo, gapRange, guideReport, layoutBars, type LayoutAuto } from '../../domain/models/guides';
import type { Lufta } from '../../domain/models/custom';
import { checkNewOverlap } from '../../domain/models/overlap';
import { MATERIAL_GROUPS, materialShape, sectionFace, type MaterialGroupId } from '../../domain/models/materialShape';
import type { Material } from '../../domain/models/types';
import { useAppStore } from '../../store/useAppStore';
import { uid } from '../../utils/id';
import { fmtMoney } from '../../utils/units';

const Designer3D = lazy(() => import('../../components/designer/Designer3D'));

type ViewMode = '2d' | '3d' | 'split' | 'skica';

/**
 * Brojčano polje: ukucana vrednost se primenjuje TEK kad se pritisne Enter (Esc vraća staru). Dok se kuca, ništa se ne menja,
 * pa međuvrednosti (npr. dok se briše 990 da bi se ukucalo novo) ne prave izmene ni greške. Neispravna vrednost se ne primenjuje
 * i polje javlja dozvoljeni opseg.
 */
function Num({ label, value, onChange, min = -100000, max = 100000, testId, unit = 'mm', readOnly = false }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; testId?: string; unit?: string; readOnly?: boolean }) {
  const [text, setText] = useState(String(value));
  const [err, setErr] = useState<string | null>(null);
  const last = useRef(value);
  if (last.current !== value) { last.current = value; if (Number(text.replace(',', '.')) !== value) setText(String(value)); if (err) setErr(null); }
  const parsed = Number(text.replace(',', '.'));
  const dirty = text.trim() === '' || !Number.isFinite(parsed) || parsed !== value;
  const fmtLimit = (n: number) => String(n).replace('.', ',');
  const commit = () => {
    if (readOnly) return;
    if (text.trim() === '' || !Number.isFinite(parsed)) { setErr('Unesite broj.'); return; }
    if (parsed < min || parsed > max) { setErr(`Dozvoljeno od ${fmtLimit(min)} do ${fmtLimit(max)} ${unit}. Vrednost nije primenjena.`); return; }
    setErr(null);
    if (parsed !== value) { last.current = value; onChange(parsed); }
  };
  const showDirty = dirty && !readOnly;
  return (
    <div className="py-1 text-[13px]">
      <label className="flex items-center justify-between gap-2">
        <span className="text-slate-600">{label}</span>
        <span className="flex items-center gap-1.5">
          <input className={`input !w-24 !py-1 text-right tabular-nums ${readOnly ? '!bg-slate-100 text-slate-600' : ''} ${showDirty && !err ? '!border-[#f79009] !bg-[#fffaeb]' : ''}`} inputMode="decimal" data-testid={testId} data-dirty={showDirty ? 'true' : undefined} aria-invalid={err ? true : undefined} value={text} readOnly={readOnly}
            onChange={(e) => { setText(e.target.value); setErr(null); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              else if (e.key === 'Escape') { setText(String(value)); setErr(null); e.stopPropagation(); }
            }} />
          <span className="text-muted w-7 text-xs">{unit}</span>
        </span>
      </label>
      {err && <p className="text-[11.5px] text-[#b42318] mt-0.5 text-right" role="alert" data-testid={testId ? `${testId}-error` : undefined}>{err}</p>}
      {!err && showDirty && <p className="text-[11.5px] text-[#b54708] mt-0.5 text-right">Enter za potvrdu · Esc za otkazivanje</p>}
    </div>
  );
}

const AUTO_LABELS: Record<LayoutAuto, string> = { gap: 'razmak između prečki', bottom: 'odstojanje od dna', top: 'odstojanje od vrha' };

/** Raspored prečki grupe (isti materijal, iste U vođice): broj, odstojanje od vrha i dna i razmak; jedna mera se računa sama. */
function BarLayoutBox({ model, bar, materials, onApply, onError }: { model: CustomModel; bar: CustomPart; materials: Material[]; onApply: (m: CustomModel) => void; onError: (msg: string) => void }) {
  const [auto, setAuto] = useState<LayoutAuto>('gap');
  const [gap1, setGap1] = useState(20);
  const info = barLayoutInfo(model, bar, materials);
  if (!info) return null;
  const single = info.count === 1;
  const eff: LayoutAuto = single && auto === 'gap' ? 'bottom' : auto;
  const cur = { count: info.count, top: info.top, bottom: info.bottom, gap: info.gap ?? gap1 };
  const lufta = info.lufta;
  const run = (patch: Partial<typeof cur>, extra: { lufta?: Lufta; auto?: LayoutAuto } = {}) => {
    const r = layoutBars(model, bar.id, materials, { ...cur, ...patch, auto: extra.auto ?? auto, lufta: extra.lufta ?? lufta });
    if ('error' in r) onError(r.error); else onApply(r.model);
  };
  /** promena tipa: razmak se dovodi u opseg novog tipa (bez lufta: najviše 0, sa luftom: najmanje 0), a odstojanje od dna se preračuna */
  const setLufta = (next: Lufta) => {
    if (next === lufta) return;
    const g = single ? 0 : next === 'bez' ? Math.min(0, cur.gap) : Math.max(0, cur.gap);
    setAuto('bottom');
    run({ gap: g }, { lufta: next, auto: 'bottom' });
  };
  const range = gapRange(info, eff, lufta);
  const fmtR = (n: number) => String(n).replace('.', ',');
  return (
    <div className="mt-2 rounded-lg border border-line p-2" data-testid="bar-layout">
      <div className="text-[12.5px] font-semibold mb-1 flex items-center gap-1.5"><Rows3 size={14} />Raspored prečki</div>
      <p className="text-[11.5px] text-muted mb-1">Visina bočnih strana <b data-testid="layout-height">{String(info.H).replace('.', ',')} mm</b>, visina prečke <b>{String(info.h).replace('.', ',')} mm</b>. Prečke se rasporede same.</p>
      <div className="flex items-center justify-between gap-2 py-1 text-[13px]">
        <span className="text-slate-600">Tip ograde</span>
        <span className="inline-flex rounded-lg border border-line overflow-hidden" role="group" aria-label="Tip ograde">
          {([['sa', 'Sa luftom'], ['bez', 'Bez lufta']] as [Lufta, string][]).map(([v, l]) => (
            <button key={v} data-testid={`layout-lufta-${v}`} aria-pressed={lufta === v} className={`px-2.5 py-1 text-[12px] font-semibold ${lufta === v ? 'bg-brand-black text-white' : 'hover:bg-slate-50'}`} onClick={() => setLufta(v)}>{l}</button>
          ))}
        </span>
      </div>
      <p className="text-[11.5px] text-muted mb-1" data-testid="layout-lufta-help">{lufta === 'bez'
        ? 'Bez lufta: između prečki nema procepa, razmak ide od 0 u minus (prečke se uvlače jedna u drugu).'
        : 'Sa luftom: između prečki se vidi procep, razmak ide od 0 do najvećeg koji staje.'}</p>
      <Num label="Broj prečki" unit="kom" value={info.count} min={1} max={200} testId="layout-count" onChange={(v) => run({ count: Math.round(v) })} />
      <Num label="Od vrha" value={info.top} min={0} testId="layout-top" readOnly={eff === 'top'} onChange={(v) => run({ top: v })} />
      <Num label="Od dna" value={info.bottom} min={0} testId="layout-bottom" readOnly={eff === 'bottom'} onChange={(v) => run({ bottom: v })} />
      <Num label="Razmak između" value={info.gap ?? 0} min={-1000} testId="layout-gap" readOnly={eff === 'gap' || single} onChange={(v) => { setGap1(v); run({ gap: v }); }} />
      <label className="flex items-center justify-between gap-2 py-1 text-[12.5px]">
        <span className="text-slate-600">Sama se računa</span>
        <select className="input !w-auto !py-1" data-testid="layout-auto" value={eff} onChange={(e) => setAuto(e.target.value as LayoutAuto)}>
          {(Object.keys(AUTO_LABELS) as LayoutAuto[]).filter((k) => !(single && k === 'gap')).map((k) => <option key={k} value={k}>{AUTO_LABELS[k]}</option>)}
        </select>
      </label>
      <p className="text-[11.5px] text-muted mb-1" data-testid="layout-gap-min">
        {info.count < 2 ? 'Razmak postoji tek sa dve ili više prečki.'
          : eff === 'gap' ? <>Razmak se računa: <b>{fmtR(range.min)} mm</b>.{lufta === 'bez' && info.gapMin < 0 ? <> Najmanji mogući je <b>{fmtR(info.gapMin)} mm</b>.</> : null}</>
            : <>Dozvoljen razmak: od <b>{fmtR(range.min)}</b> do <b>{fmtR(range.max)} mm</b>{lufta === 'bez' && info.gapMin >= 0 ? ' (prečke bez nagiba ne mogu da se uvuku, pa je razmak 0)' : ''}.</>}
      </p>
      <p className="text-[11.5px] text-muted">Izmena broja prečki dodaje kopije izabrane prečke ili skida prečke pri dnu. Ako prečke ne staju u visinu bočnih strana, izmena se ne primenjuje i obaveštenje navodi razlog.</p>
    </div>
  );
}

function Palette({ materials, activeId, onPick }: { materials: Material[]; activeId: string | null; onPick: (id: string | null) => void }) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    const by = new Map<MaterialGroupId, Material[]>();
    for (const m of materials) {
      if (t && !m.name.toLowerCase().includes(t) && !m.sku.toLowerCase().includes(t)) continue;
      const g = materialShape(m).group;
      by.set(g, [...(by.get(g) ?? []), m]);
    }
    return MATERIAL_GROUPS.filter((g) => by.has(g.id)).map((g) => ({ ...g, items: by.get(g.id)!.sort((a, b) => a.name.localeCompare(b.name, 'sr', { numeric: true })) }));
  }, [materials, q]);
  return (
    <div className="flex flex-col h-full min-h-0" data-testid="designer-palette">
      <div className="p-3 border-b border-line">
        <button className={`btn btn-sm w-full mb-2 ${activeId === null ? 'btn-dark' : ''}`} data-testid="designer-tool-select" onClick={() => onPick(null)}><MousePointer2 size={15} />Izbor i pomeranje</button>
        <div className="relative"><Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" /><input className="input !pl-8 !py-1.5" placeholder="Pretraga materijala" aria-label="Pretraga materijala" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto scroll-thin p-2">
        {materials.length === 0 && (
          <p className="text-sm text-muted p-2" data-testid="designer-no-materials">Cenovnik je prazan. Uvezite materijale na strani <Link className="text-primary font-semibold" to="/materijali">Materijali i cene</Link>, pa će se ovde pojaviti razvrstani po grupama.</p>
        )}
        {materials.length > 0 && groups.length === 0 && <p className="text-sm text-muted p-2">Nema materijala koji odgovaraju pretrazi.</p>}
        {groups.map((g) => (
          <details key={g.id} open={q.trim() !== '' || g.items.some((m) => m.id === activeId) || undefined} className="mb-1" data-testid={`designer-group-${g.id}`}>
            <summary className="cursor-pointer select-none px-2 py-1.5 rounded-lg hover:bg-slate-50 text-[13px] font-semibold flex items-center justify-between"><span>{g.label}</span><span className="text-muted font-normal">{g.items.length}</span></summary>
            <div className="pl-1 pt-1">
              {g.items.map((m) => {
                const shape = materialShape(m);
                const on = m.id === activeId;
                return (
                  <button key={m.id} data-testid="designer-material" data-sku={m.sku} aria-pressed={on} title={m.name} onClick={() => onPick(on ? null : m.id)}
                    className={`w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg border ${on ? 'border-primary bg-primary-50' : 'border-transparent hover:bg-slate-50'}`}>
                    <span className="shrink-0 w-9 h-9 grid place-items-center bg-white border border-line rounded-md"><ShapeIcon shape={shape} size={30} /></span>
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-medium leading-tight line-clamp-2">{m.name}</span>
                      <span className="block text-[11px] text-muted">{m.sku}{shape.type === 'linear' ? ` · ${sectionFace(shape.section, 0).face} × ${sectionFace(shape.section, 0).depth} mm` : ''}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

export default function ModelDesignerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  // nov crtež odmah dobija svoju adresu, da se posle osvežavanja strane nastavi isti model
  useEffect(() => { if (!id) navigate(`/modeli/crtanje/${uid('cm')}`, { replace: true }); }, [id, navigate]);
  return id ? <Designer key={id} id={id} /> : null;
}

function Designer({ id }: { id: string }) {
  const materials = useAppStore((s) => s.materials);
  const settings = useAppStore((s) => s.settings);
  const [model, setModel] = useState<CustomModel>(() => useAppStore.getState().settings.customModels?.find((m) => m.id === id) ?? newCustomModel(id));
  const [hist, setHist] = useState<{ past: CustomModel[]; future: CustomModel[] }>({ past: [], future: [] });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('2d');
  const [ortho, setOrtho] = useState(true);
  const [grid, setGrid] = useState(5);
  const [rep, setRep] = useState({ count: 5, step: 100 });
  /** obaveštenje (napomena) zašto operacija nije izvršena */
  const [notice, setNotice] = useState<string | null>(null);
  const [sketchBusy, setSketchBusy] = useState(false);
  const modelRef = useRef(model);
  modelRef.current = model;
  const materialsRef = useRef(materials);
  materialsRef.current = materials;

  const record = useCallback(() => setHist((h) => ({ past: [...h.past.slice(-99), modelRef.current], future: [] })), []);
  /**
   * Izmena crteža. Vraća false (i piše obaveštenje) kad bi izmena napravila preklapanje delova; tada se ništa ne menja.
   * Uklopljene prečke se posle izmene vraćaju unutar svojih U profila.
   */
  const change = useCallback((fn: (m: CustomModel) => CustomModel, keep = true): boolean => {
    const cur = modelRef.current;
    const raw = fn(cur);
    if (raw === cur) return true;
    const next = applyGuides(raw, materialsRef.current);
    const bad = checkNewOverlap(cur, next, materialsRef.current);
    if (bad) { setNotice(bad); return false; }
    if (keep) setHist((h) => ({ past: [...h.past.slice(-99), cur], future: [] }));
    const upd = { ...next, updatedAt: new Date().toISOString() };
    modelRef.current = upd;
    setModel(upd);
    setNotice(null);
    return true;
  }, []);
  const undo = useCallback(() => setHist((h) => { if (!h.past.length) return h; setModel(h.past[h.past.length - 1]); return { past: h.past.slice(0, -1), future: [modelRef.current, ...h.future] }; }), []);
  const redo = useCallback(() => setHist((h) => { if (!h.future.length) return h; setModel(h.future[0]); return { past: [...h.past, modelRef.current], future: h.future.slice(1) }; }), []);

  // čuvanje: model se upisuje u podešavanja čim ima bar jedan deo (ili je već sačuvan), pa se izmene ne gube
  useEffect(() => {
    const st = useAppStore.getState();
    const list = st.settings.customModels ?? [];
    const saved = list.find((m) => m.id === model.id);
    if (saved === model || (!saved && model.parts.length === 0)) return;
    st.updateSettings({ customModels: saved ? list.map((m) => (m.id === model.id ? model : m)) : [...list, model] });
  }, [model]);

  // promena materijala (npr. debljine zida U profila) menja kanal: uklopljene prečke se vraćaju u nove granice
  useEffect(() => {
    const next = applyGuides(modelRef.current, materials);
    if (next !== modelRef.current) { modelRef.current = next; setModel(next); }
  }, [materials]);

  const parts = useMemo(() => resolveParts(model, materials), [model, materials]);
  const active = activeId ? materials.find((m) => m.id === activeId) ?? null : null;
  const sel = parts.find((r) => r.part.id === selectedId) ?? null;
  const bom = useMemo(() => customBom(model, materials), [model, materials]);
  const total = bom.reduce((s, l) => s + l.total, 0);

  const exportSketch = async (kind: 'pdf' | 'svg') => {
    setSketchBusy(true);
    try { if (kind === 'pdf') await downloadSketchPdf(modelRef.current, materials, settings); else await downloadSketchSvg(modelRef.current, materials); setNotice(null); }
    catch (e) { setNotice(`Skica nije napravljena: ${(e as Error).message}`); } finally { setSketchBusy(false); }
  };
  const report = sel && sel.part.guides ? guideReport(model, sel.part, materials) : null;
  const fmtDeg = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
  /** prečka se uklapa u bočne U profile (ručno dugmetom ili samo od sebe kad se nacrta između njih) */
  const attach = (base: CustomModel, pid: string, quiet: boolean): CustomModel | null => {
    const r = attachToGuides(base, pid, materials);
    if ('error' in r) { if (!quiet) setNotice(r.error); return null; }
    return r.model;
  };
  const patchPart = (pid: string, patch: Partial<CustomPart>, keep = true) => change((m) => ({ ...m, parts: m.parts.map((p) => (p.id === pid ? { ...p, ...patch } : p)) }), keep);
  const removeSel = useCallback(() => { if (!selectedId) return; change((m) => ({ ...m, parts: m.parts.filter((p) => p.id !== selectedId) })); setSelectedId(null); }, [selectedId, change]);
  const duplicateSel = useCallback(() => {
    const p = modelRef.current.parts.find((x) => x.id === selectedId);
    if (!p) return;
    const copy = { ...p, id: uid('part'), x: p.x + 50, y: p.y + 50 };
    if (change((m) => ({ ...m, parts: [...m.parts, copy] }))) setSelectedId(copy.id);
  }, [selectedId, change]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as Element).closest('input,select,textarea')) return;
      if (e.key === 'Escape') { setActiveId(null); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSel(); return; }
      if (!selectedId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSel(); return; }
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
      if (d) { e.preventDefault(); const p = modelRef.current.parts.find((x) => x.id === selectedId); if (p) change((m) => ({ ...m, parts: m.parts.map((x) => (x.id === selectedId ? { ...x, x: p.x + d[0] * grid, y: p.y + d[1] * grid } : x)) })); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, grid, undo, redo, removeSel, duplicateSel, change]);

  return (
    <div className="h-full flex flex-col min-h-0" data-testid="model-designer">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-line bg-white">
        <Link to="/modeli" className="btn btn-sm" data-testid="designer-back"><ArrowLeft size={15} />Modeli</Link>
        <input className="input !w-56 !py-1.5 font-semibold" aria-label="Naziv modela" data-testid="designer-name" value={model.name} onChange={(e) => change((m) => ({ ...m, name: e.target.value }), false)} />
        <select className="input !w-auto !py-1.5" aria-label="Vrsta" data-testid="designer-kind" value={model.kind} onChange={(e) => change((m) => ({ ...m, kind: e.target.value as CustomModel['kind'] }))}>
          {Object.entries(CUSTOM_KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <Num label="Širina" value={model.widthMm} min={100} max={20000} testId="designer-width" onChange={(v) => change((m) => ({ ...m, widthMm: Math.round(v) }))} />
        <Num label="Visina" value={model.heightMm} min={100} max={6000} testId="designer-height" onChange={(v) => change((m) => ({ ...m, heightMm: Math.round(v) }))} />
        <select className="input !w-auto !py-1.5" aria-label="Boja" data-testid="designer-color" value={model.color} onChange={(e) => change((m) => ({ ...m, color: e.target.value }))}>
          {RAL_COLORS.map((c) => <option key={c.key} value={c.key}>{c.key} — {c.name}</option>)}
        </select>
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-[13px]" title="Profili se crtaju samo vodoravno ili uspravno"><input type="checkbox" checked={ortho} data-testid="designer-ortho" onChange={(e) => setOrtho(e.target.checked)} />Pod pravim uglom</label>
        <select className="input !w-auto !py-1.5" aria-label="Korak mreže" value={grid} onChange={(e) => setGrid(Number(e.target.value))}>
          {[1, 5, 10, 50].map((g) => <option key={g} value={g}>korak {g} mm</option>)}
        </select>
        <button className="btn btn-sm btn-icon" aria-label="Poništi" disabled={!hist.past.length} onClick={undo}><Undo2 size={16} /></button>
        <button className="btn btn-sm btn-icon" aria-label="Ponovi izmenu" disabled={!hist.future.length} onClick={redo}><Redo2 size={16} /></button>
        <div className="inline-flex rounded-lg border border-line overflow-hidden" role="group" aria-label="Prikaz">
          {([['2d', '2D'], ['split', '2D + 3D'], ['3d', '3D'], ['skica', 'Skica']] as [ViewMode, string][]).map(([v, l]) => (
            <button key={v} data-testid={`designer-view-${v}`} aria-pressed={view === v} className={`px-3 py-1.5 text-[13px] font-semibold ${view === v ? 'bg-brand-black text-white' : 'bg-white hover:bg-slate-50'}`} onClick={() => setView(v)}>{l}</button>
          ))}
        </div>
      </div>

      {notice && (
        <div className="flex items-start gap-2 px-3 py-2 bg-[#fef3f2] border-b border-[#fecdca] text-[13px] text-[#b42318]" role="alert" data-testid="designer-notice">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{notice}</span>
          <button className="shrink-0 p-0.5 rounded hover:bg-[#fee4e2]" aria-label="Zatvori obaveštenje" onClick={() => setNotice(null)}><X size={15} /></button>
        </div>
      )}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)_300px]">
        <aside className="border-r border-line bg-white min-h-0 max-h-[40vh] lg:max-h-none"><Palette materials={materials} activeId={activeId} onPick={(m) => { setActiveId(m); if (m) setSelectedId(null); }} /></aside>

        <section className={`min-h-[420px] lg:min-h-0 grid ${view === 'split' ? 'grid-rows-2 xl:grid-rows-1 xl:grid-cols-2' : ''}`}>
          {view === 'skica' && (
            <div className="min-h-0 flex flex-col bg-white" data-testid="designer-sketch">
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-line">
                <span className="text-[13px] text-slate-600 flex-1 min-w-[200px]">Skica sa kotama za majstora: sve mere, razmaci između prečki, tabela delova i presek prečke u U profilu.</span>
                <button className="btn btn-sm btn-primary" data-testid="sketch-pdf" disabled={sketchBusy || model.parts.length === 0} onClick={() => void exportSketch('pdf')}><FileText size={15} />{sketchBusy ? 'Pravljenje…' : 'Preuzmi PDF'}</button>
                <button className="btn btn-sm" data-testid="sketch-svg" disabled={sketchBusy || model.parts.length === 0} onClick={() => void exportSketch('svg')}><Download size={15} />SVG</button>
              </div>
              <div className="flex-1 min-h-0 overflow-auto scroll-thin p-3">
                {model.parts.length === 0
                  ? <p className="text-sm text-muted p-4">Model još nema delova. Nacrtajte ga u prikazu 2D, pa se ovde pojavljuje skica sa svim kotama.</p>
                  : <SketchSvg model={model} materials={materials} style={{ width: '100%', height: 'auto', maxWidth: 1500 }} />}
              </div>
            </div>
          )}
          {view !== '3d' && view !== 'skica' && (
            <Designer2D model={model} parts={parts} active={active} selectedId={selectedId} ortho={ortho} gridMm={grid}
              onSelect={setSelectedId}
              onAdd={(p) => { const next = { ...modelRef.current, parts: [...modelRef.current.parts, p] }; const fitted = p.angleDeg === 0 ? attach(next, p.id, true) : null; if (change(() => fitted ?? next)) setSelectedId(p.id); }}
              onMoveStart={record}
              onMove={(pid, x, y) => patchPart(pid, { x, y }, false)} />
          )}
          {view !== '2d' && view !== 'skica' && (
            <div className={`min-h-0 ${view === 'split' ? 'border-t xl:border-t-0 xl:border-l border-line' : ''}`}>
              <Suspense fallback={<div className="h-full grid place-items-center text-muted text-sm">Učitavanje 3D prikaza…</div>}>
                <Designer3D model={model} parts={parts} selectedId={selectedId} />
              </Suspense>
            </div>
          )}
        </section>

        <aside className="border-l border-line bg-white min-h-0 overflow-auto scroll-thin p-3">
          <h2 className="font-bold text-[15px] mb-1">Izabrani deo</h2>
          {!sel && <p className="text-sm text-muted mb-4" data-testid="designer-no-selection">Izaberite materijal levo i nacrtajte ga na polju, ili kliknite na nacrtani deo da ga izmenite.</p>}
          {sel && (
            <div className="mb-4" data-testid="designer-props">
              <div className="text-[13px] font-medium leading-snug">{sel.material?.name ?? 'Materijal je obrisan iz cenovnika'}</div>
              <div className="text-[11.5px] text-muted mb-2">{sel.material?.sku}{sel.shape.type === 'linear' ? ` · presek ${sel.shape.section.w} × ${sel.shape.section.h} mm${sel.shape.exact ? '' : ' (približan oblik prema nazivu)'}` : ''}</div>
              {sel.shape.type === 'linear' && sel.shape.wall !== undefined && sel.material && (
                <div className="mb-1">
                  <Num label="Debljina zida" value={sel.shape.wall} min={0.5} max={20} testId="part-wall" onChange={(v) => useAppStore.getState().upsertMaterial({ ...sel.material!, wallMm: v })} />
                  <p className="text-[11.5px] text-muted -mt-0.5">{sel.shape.u ? <>Unutrašnji otvor U profila: <b data-testid="part-u-opening">{String(Math.round((sel.shape.u.a - 2 * sel.shape.u.c) * 100) / 100).replace('.', ',')} mm</b>. </> : null}Menja materijal u cenovniku, pa važi za sve delove od njega.</p>
                </div>
              )}
              <Num label="X" value={sel.part.x} testId="part-x" onChange={(v) => patchPart(sel.part.id, { x: v })} />
              <Num label="Y (od tla)" value={sel.part.y} testId="part-y" onChange={(v) => patchPart(sel.part.id, { y: v })} />
              {sel.shape.type !== 'piece' && <Num label={sel.shape.type === 'sheet' ? 'Širina' : 'Dužina'} value={sel.part.lengthMm} min={1} testId="part-length" onChange={(v) => patchPart(sel.part.id, { lengthMm: v })} />}
              {sel.shape.type === 'sheet' && <Num label="Visina" value={sel.part.heightMm ?? 0} min={1} testId="part-height" onChange={(v) => patchPart(sel.part.id, { heightMm: v })} />}
              {sel.shape.type !== 'sheet' && <Num label="Ugao" unit="°" value={sel.part.angleDeg} min={-360} max={360} testId="part-angle" onChange={(v) => patchPart(sel.part.id, { angleDeg: v })} />}
              {sel.shape.type === 'linear' && (
                <div className="flex items-center justify-between gap-2 py-1 text-[13px]">
                  <span className="text-slate-600">Okretanje preseka</span>
                  <span className="inline-flex rounded-lg border border-line overflow-hidden">
                    {[0, 90, 180, 270].map((r) => <button key={r} data-testid={`part-rot-${r}`} aria-pressed={sel.part.rot === r} className={`px-2 py-1 text-[12px] font-semibold ${sel.part.rot === r ? 'bg-brand-black text-white' : 'hover:bg-slate-50'}`} onClick={() => patchPart(sel.part.id, { rot: r })}>{r}°</button>)}
                  </span>
                </div>
              )}
              {sel.shape.type === 'linear' && (
                <Num label="Nagib preseka (koso)" unit="°" value={sel.part.tiltDeg ?? 0} min={-89.9} max={89.9} testId="part-tilt" onChange={(v) => patchPart(sel.part.id, { tiltDeg: v || undefined })} />
              )}
              {sel.shape.type === 'linear' && (
                <label className="flex items-center justify-between gap-2 py-1 text-[13px]" title="Deo rama: oba kraja se seku pod 45°; u krojnoj listi dobija oznaku 45°">
                  <span className="text-slate-600">Rez 45° (deo rama)</span>
                  <input type="checkbox" data-testid="part-cut45" checked={!!sel.part.cut45} onChange={(e) => patchPart(sel.part.id, { cut45: e.target.checked || undefined })} />
                </label>
              )}
              <Num label="Dubina (ka napred)" value={sel.part.z} min={-2000} max={2000} testId="part-z" onChange={(v) => patchPart(sel.part.id, { z: v })} />
              {report && (
                <div className="mt-2 rounded-lg border border-primary/40 bg-primary-50/40 p-2" data-testid="guide-box">
                  <div className="text-[12.5px] font-semibold mb-1.5 flex items-center gap-1.5"><Link2 size={14} />Prečka u bočnim U profilima</div>
                  <GuideSection bar={sel.part} report={report} />
                  <table className="w-full text-[12.5px] mt-2"><tbody>
                    <tr><td className="text-slate-600 py-0.5">Unutrašnji otvor U profila</td><td className="text-right font-medium tabular-nums">{fmtDeg(report.opening)} mm</td></tr>
                    <tr><td className="text-slate-600 py-0.5">Ugao uklapanja</td><td className="text-right font-bold tabular-nums text-primary" data-testid="guide-fit-angle">{fmtDeg(report.fit.plus)}°</td></tr>
                    <tr><td colSpan={2} className="text-[11.5px] text-muted pb-1">od ravni ograde ({fmtDeg(90 - report.fit.plus)}° od vodoravne): pod tim uglom prečka dodiruje obe stranice U profila. Veći nagib nije dozvoljen.</td></tr>
                    <tr><td className="text-slate-600 py-0.5">Trenutni nagib</td><td className="text-right font-medium tabular-nums" data-testid="guide-tilt">{fmtDeg(Math.abs(sel.part.tiltDeg ?? 0))}°</td></tr>
                    <tr><td className="text-slate-600 py-0.5">Visina prečke spreda</td><td className="text-right font-medium tabular-nums">{fmtDeg(sectionFace(report.section, sel.part.rot + (sel.part.tiltDeg ?? 0)).face)} mm</td></tr>
                    <tr><td className="text-slate-600 py-0.5">Ulazi u kanal (levo / desno)</td><td className="text-right font-medium tabular-nums" data-testid="guide-insert">{fmtDeg(report.L.mouthX - sel.part.x)} / {fmtDeg(sel.part.x + sel.part.lengthMm - report.R.mouthX)} mm</td></tr>
                  </tbody></table>
                  <div className="flex gap-2 mt-2">
                    <button className="btn btn-sm btn-primary flex-1" data-testid="guide-set-fit" onClick={() => patchPart(sel.part.id, { tiltDeg: report.fit.plus })}>Postavi pod uglom uklapanja</button>
                    <button className="btn btn-sm" data-testid="guide-detach" title="Prečka više ne prati U profile" onClick={() => patchPart(sel.part.id, { guides: undefined })}><Link2Off size={14} />Odvoji</button>
                  </div>
                  <p className="text-[11.5px] text-muted mt-1.5">Prečka ne može da izađe van U profila: dužina, položaj, dubina i nagib se ograničavaju na kanal.</p>
                </div>
              )}
              {report && <BarLayoutBox key={sel.part.id} model={model} bar={sel.part} materials={materials} onApply={(m) => change(() => m)} onError={setNotice} />}
              {sel.shape.type === 'linear' && !report && sel.part.angleDeg % 180 === 0 && (
                <div className="mt-2">
                  <button className="btn btn-sm w-full" data-testid="guide-attach" onClick={() => { const fitted = attach(modelRef.current, sel.part.id, false); if (fitted) change(() => fitted); }}><Link2 size={14} />Uklopi u bočne U profile</button>
                </div>
              )}
              <div className="mt-2 rounded-lg border border-line p-2">
                <div className="text-[12.5px] font-semibold mb-1 flex items-center gap-1.5"><Rows3 size={14} />Ponovi deo</div>
                <Num label="Broj kopija" unit="kom" value={rep.count} min={1} max={200} onChange={(v) => setRep({ ...rep, count: Math.round(v) })} />
                <Num label="Korak (osa–osa)" value={rep.step} min={-5000} max={5000} onChange={(v) => setRep({ ...rep, step: v })} />
                <button className="btn btn-sm w-full mt-1" data-testid="part-repeat" onClick={() => change((m) => ({ ...m, parts: [...m.parts, ...repeatPart(sel.part, sel.shape, rep.count, rep.step, () => uid('part'))] }))}>Napravi kopije</button>
                <p className="text-[11.5px] text-muted mt-1">Vodoravan profil se ponavlja nagore, uspravan udesno.</p>
              </div>
              <div className="flex gap-2 mt-2">
                <button className="btn btn-sm flex-1" data-testid="part-duplicate" onClick={duplicateSel}><Copy size={14} />Dupliraj</button>
                <button className="btn btn-sm btn-danger flex-1" data-testid="part-delete" onClick={removeSel}><Trash2 size={14} />Obriši</button>
              </div>
            </div>
          )}

          <h2 className="font-bold text-[15px] mb-1">Spisak materijala</h2>
          {bom.length === 0 ? <p className="text-sm text-muted">Model još nema delova.</p> : (
            <table className="w-full text-[12.5px]" data-testid="designer-bom">
              <tbody>
                {bom.map((l) => (
                  <tr key={l.materialId} className="border-t border-line align-top">
                    <td className="py-1.5 pr-2"><div className="font-medium leading-tight">{l.name}</div><div className="text-muted">{l.sku} · {l.qtyLabel}</div></td>
                    <td className="py-1.5 text-right tabular-nums whitespace-nowrap">{l.missing ? <span className="text-[#b45309]">bez cene</span> : fmtMoney(l.total, settings.currency, settings.currencyRateToEur)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line font-bold"><td className="py-1.5">Materijal ukupno</td><td className="py-1.5 text-right tabular-nums whitespace-nowrap" data-testid="designer-total">{fmtMoney(total, settings.currency, settings.currencyRateToEur)}</td></tr>
              </tbody>
            </table>
          )}
          <p className="text-[11.5px] text-muted mt-2">Količine su tačne mere sa crteža, bez otpada. Model se čuva automatski.</p>
        </aside>
      </div>
    </div>
  );
}
