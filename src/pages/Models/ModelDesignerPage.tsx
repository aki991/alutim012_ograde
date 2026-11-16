import { settleModel as settle } from '../../domain/models/settle';
import { checkDrawing } from '../../domain/models/drawingCheck';
import { hingesAlongEdge, isHingeMaterial, restOnSurface } from '../../domain/models/surface';
import { ALL_FRAME_SIDES, frameIds, isFramePart, modelWithFrame, modelWithoutFrame, modelWithRotatedFrame, resizeWithFrame } from '../../domain/models/frame';
import { GateDesignModal } from '../../components/gates/GateDesignModal';
import { SlidingAssemblyArt } from '../../components/gates/SlidingAssemblyArt';
import { SlidingDesignerPanel, SlidingPartButtons } from '../../components/gates/SlidingDesignerPanel';
import type { SlidingSpec } from '../../domain/gates/slidingAssembly';
import { placeSliding } from '../../domain/gates/slidingLayout';
import { compPart, partDef } from '../../domain/gates/slidingParts';
import { createGate } from '../../domain/models/factories';
import { defaultGateConfig, GATE_TYPE_LABELS } from '../../domain/gates/gateModels';
import { AlertTriangle, ArrowLeft, Copy, Download, FileText, Link2, MousePointer2, Redo2, Rows3, Search, Trash2, Undo2, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Designer2D } from '../../components/designer/Designer2D';
import { GuideSection } from '../../components/designer/GuideSection';
import { MaterialPicker } from '../../components/designer/MaterialPicker';
import { SketchSvg } from '../../components/designer/Sketch';
import { downloadSketchPdf, downloadSketchSvg } from '../../services/pdfSketch';
import { resolveParts, ShapeIcon } from '../../components/designer/PartsSvg';
import { colorHex, FENCE_MODELS, normalizeColorKey } from '../../domain/models/catalog';
import { ColorChartModal, normalizeFavorites } from '../../components/forms/ColorChartModal';
import { CUSTOM_KIND_LABELS, customBom, newCustomModel, newTerraceModel, repeatPart, setPartsColor, type CustomModel, type CustomPart } from '../../domain/models/custom';
import { attachToGuides, barGroup, barLayoutInfo, gapRange, guideReport, layoutBars, type LayoutAuto } from '../../domain/models/guides';
import type { Lufta } from '../../domain/models/custom';
import { checkNewOverlap } from '../../domain/models/overlap';
import { replaceMaterial, replaceOptions, replaceRole, replaceTargets } from '../../domain/models/replace';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { compareMaterials, isSymmetricRect, isTerraceMaterial, MATERIAL_GROUPS, materialShape, matchesSearch, sectionFace, type MaterialGroupId, type Section } from '../../domain/models/materialShape';
import type { FenceModelId, GateType, Material } from '../../domain/models/types';
import { useAppStore } from '../../store/useAppStore';
import { uid } from '../../utils/id';
import { fmtMoney } from '../../utils/units';

const Designer3D = lazy(() => import('../../components/designer/Designer3D'));

type ViewMode = '2d' | '3d' | 'split' | 'skica' | 'mere';

/**
 * Brojčano polje: ukucana vrednost se primenjuje TEK kad se pritisne Enter (Esc vraća staru). Dok se kuca, ništa se ne menja,
 * pa međuvrednosti (npr. dok se briše 990 da bi se ukucalo novo) ne prave izmene ni greške. Neispravna vrednost se ne primenjuje
 * i polje javlja dozvoljeni opseg.
 */
function Num({ label, value, onChange, min = -100000, max = 100000, testId, unit = 'mm', readOnly = false, onSame }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; testId?: string; unit?: string; readOnly?: boolean; onSame?: () => void }) {
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
    if (parsed !== value) { last.current = value; onChange(parsed); } else onSame?.();
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
  const run = (patch: Partial<typeof cur>, extra: { lufta?: Lufta; auto?: LayoutAuto; countChange?: boolean } = {}) => {
    const r = layoutBars(model, bar.id, materials, { ...cur, ...patch, auto: extra.auto ?? auto, lufta: extra.lufta ?? lufta, countChange: extra.countChange });
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
      <p className="text-[11.5px] text-muted mb-1">{info.free ? 'Prostor za prečke (visina modela između ramova)' : 'Visina bočnih strana'} <b data-testid="layout-height">{String(info.H).replace('.', ',')} mm</b>, visina prečke <b>{String(info.h).replace('.', ',')} mm</b>. Prečke se rasporede same.</p>
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
      <Num label="Broj prečki" unit="kom" value={info.count} min={1} max={200} testId="layout-count" onSame={() => onError('')} onChange={(v) => run({ count: Math.round(v) }, { countChange: true })} />
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
      <p className="text-[11.5px] text-muted">Izmena broja prečki dodaje kopije izabrane prečke ili skida prečke pri dnu. Ako prečke ne staju u {info.free ? 'raspoloživu visinu' : 'visinu bočnih strana'}, izmena se ne primenjuje i obaveštenje navodi razlog.</p>
    </div>
  );
}

/** Čeona strana pravougaone cevi: dva dugmeta sa merama stranica preseka (npr. 60 mm i 40 mm); izabrana je okrenuta ka posmatraču. */
/**
 * Boja izabranih delova (npr. crn ram, a sive prečke i bočni U profil): pet boja za brzi izbor i cela karta boja (RAL), kao na
 * strani Trenutni projekat. „Boja modela“ vraća delove na boju modela.
 */
function PartColorField({ testPrefix, colors, modelColor, onPick }: { testPrefix: string; colors: (string | undefined)[]; modelColor: string; onPick: (color: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const favorites = normalizeFavorites(useAppStore((s) => s.settings.favoriteColors));
  const distinct = [...new Set(colors.map((c) => c ?? ''))];
  const cur = distinct.length === 1 ? distinct[0] : null; // '' = boja modela, null = različite boje
  const label = cur === null ? 'različite boje' : cur ? normalizeColorKey(cur) : `boja modela (${normalizeColorKey(modelColor)})`;
  const own = colors.some((c) => !!c);
  return (
    <div className="py-1.5 text-[13px]" data-testid={`${testPrefix}-color-box`}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-slate-600">{colors.length > 1 ? 'Boja izabranih delova' : 'Boja dela'}</span>
        <span className="text-[12px] text-slate-600 tabular-nums" data-testid={`${testPrefix}-color-value`}>{label}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={colors.length > 1 ? 'Boja izabranih delova' : 'Boja dela'}>
        {favorites.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={cur === k} aria-label={k} title={k} data-color={k} onClick={() => onPick(k)}
            className={`w-6 h-6 rounded-full shrink-0 ${cur === k ? 'ring-2 ring-primary ring-offset-2' : 'ring-1 ring-black/15 hover:ring-2 hover:ring-slate-400'}`} style={{ background: colorHex(k) }} />
        ))}
        <button type="button" className="btn btn-sm !px-2" data-testid={`${testPrefix}-color`} aria-label="Otvori kartu boja za izabrane delove" onClick={() => setOpen(true)}>
          <span className="w-4 h-4 rounded-full ring-1 ring-black/20" style={{ background: colorHex(cur || modelColor) }} />Karta boja
        </button>
        <button type="button" className="btn btn-sm !px-2" data-testid={`${testPrefix}-color-reset`} disabled={!own} title="Delovi dobijaju boju modela" onClick={() => onPick(null)}>Boja modela</button>
      </div>
      {open && <ColorChartModal value={cur || ''} favorites={favorites} onPick={(k) => onPick(k)} onFavorites={(list) => useAppStore.getState().updateSettings({ favoriteColors: list })} onClose={() => setOpen(false)} />}
    </div>
  );
}

function FaceChoice({ testPrefix, a, b, firstPressed, secondPressed, mixed, onPick }: { testPrefix: string; a: number; b: number; firstPressed: boolean; secondPressed?: boolean; mixed?: boolean; onPick: (rot: number) => void }) {
  const f = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
  const sq = Math.abs(a - b) < 0.05;
  const second = secondPressed ?? !firstPressed;
  return (
    <div className="grid gap-1 py-1 text-[13px]" data-testid={`${testPrefix}-face`}>
      <span className="text-slate-600">Čeona strana{sq ? '' : ` cevi ${f(a)}×${f(b)}`}{mixed ? ' (različito)' : ''}</span>
      {sq ? <p className="text-[11.5px] text-muted">Kvadratni presek: nema šta da se okreće.</p> : (
        <>
          <span className="grid grid-cols-2 rounded-lg border border-line overflow-hidden">
            {([[0, a, firstPressed], [90, b, second]] as [number, number, boolean][]).map(([r, v, on]) => (
              <button key={r} data-testid={`${testPrefix}-face-${r}`} aria-pressed={on} className={`py-1 text-[12px] font-semibold ${on ? 'bg-brand-black text-white' : 'hover:bg-slate-50'}`} onClick={() => onPick(r)}>{f(v)} mm</button>
            ))}
          </span>
          <p className="text-[11.5px] text-muted">Stranica okrenuta ka posmatraču (širina cevi na crtežu). Uglovi sečenja ostaju isti, a menjaju se dužine u krojnoj listi.</p>
        </>
      )}
    </div>
  );
}

function Palette({ materials, activeId, onPick, terrace, showAll }: {
  materials: Material[]; activeId: string | null; onPick: (id: string | null) => void;
  /** crtanje ograde za terasu: podrazumevano se nude samo materijali za terase */
  terrace: boolean;
  /** izbor „prikaži i ostale materijale“ (dvorišne kod terasa, terasne kod dvorišnih ograda) */
  showAll: { checked: boolean; onChange: (v: boolean) => void };
}) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const by = new Map<MaterialGroupId, Material[]>();
    for (const m of materials) {
      if (!matchesSearch(`${m.name} ${m.sku}`, q)) continue;
      const g = materialShape(m).group;
      by.set(g, [...(by.get(g) ?? []), m]);
    }
    return MATERIAL_GROUPS.filter((g) => by.has(g.id)).map((g) => ({ ...g, items: by.get(g.id)!.sort(compareMaterials) }));
  }, [materials, q]);
  return (
    <div className="flex flex-col h-full min-h-0" data-testid="designer-palette">
      <div className="p-3 border-b border-line">
        <button className={`btn btn-sm w-full mb-2 ${activeId === null ? 'btn-dark' : ''}`} data-testid="designer-tool-select" onClick={() => onPick(null)}><MousePointer2 size={15} />Izbor i pomeranje</button>
        <div className="relative"><Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" /><input className="input !pl-8 !py-1.5" placeholder="Pretraga materijala" aria-label="Pretraga materijala" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <label className="flex items-center gap-1.5 text-[12px] text-muted mt-2" title={terrace ? 'Pored materijala za terase nudi i materijale dvorišnih ograda i kapija' : 'Pored materijala dvorišnih ograda i kapija nudi i materijale za terase'}>
          <input type="checkbox" data-testid="designer-show-all-materials" checked={showAll.checked} onChange={(e) => showAll.onChange(e.target.checked)} />
          {terrace ? 'Prikaži i ostale materijale' : 'Prikaži i materijale za terase'}
        </label>
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

/**
 * Crtanje modela. Sa `terrace` (adresa /modeli-terasa/crtanje) je to crtanje ograda za terase: nov crtež je „Ograda za terasu“,
 * paleta nudi samo materijale za terase, a povratak vodi na Modele ograda za terase.
 */
export default function ModelDesignerPage({ terrace = false }: { terrace?: boolean }) {
  const { id } = useParams();
  const navigate = useNavigate();
  // nov crtež odmah dobija svoju adresu, da se posle osvežavanja strane nastavi isti model
  useEffect(() => { if (!id) navigate(`${terrace ? '/modeli-terasa/crtanje' : '/modeli/crtanje'}/${uid('cm')}`, { replace: true }); }, [id, navigate, terrace]);
  return id ? <Designer key={id} id={id} terrace={terrace} /> : null;
}

function Designer({ id, terrace }: { id: string; terrace: boolean }) {
  const allMaterials = useAppStore((s) => s.materials);
  const settings = useAppStore((s) => s.settings);
  const location = useLocation();
  const locState = location.state as { dorada?: boolean; kind?: CustomModel['kind'] } | null;
  const [model, setModel] = useState<CustomModel>(() => useAppStore.getState().settings.customModels?.find((m) => m.id === id)
    ?? (terrace || locState?.kind === 'terrace' ? newTerraceModel(id)
      : locState?.kind === 'gate' ? { ...newCustomModel(id), kind: 'gate', name: 'Nova kapija', widthMm: 1000, heightMm: 1500, gate: defaultGateConfig() } : newCustomModel(id)));
  /** ograda za terasu: paleta nudi samo materijale za terase (dvorišne ograde i kapije ih ne nude) */
  const isTerrace = model.kind === 'terrace';
  const [showAllMaterials, setShowAllMaterials] = useState(false);
  const paletteMaterials = useMemo(() => (showAllMaterials ? allMaterials : allMaterials.filter((m) => isTerraceMaterial(m) === isTerrace)), [allMaterials, isTerrace, showAllMaterials]);
  const materials = allMaterials;
  // vrsta crteža ide u stanje adrese (ista adresa, bez ponovnog učitavanja): meni označava „Modeli kapija“ dok se crta kapija
  const navigateKind = useNavigate();
  useEffect(() => {
    if (locState?.kind !== model.kind) navigateKind(location.pathname, { replace: true, state: { ...(locState ?? {}), kind: model.kind } });
  }, [model.kind, locState, location.pathname, navigateKind]);
  /** „Mere kapije“ otvorene iz crtanja: privremen projekat sa kapijom ovog modela */
  const [draft, setDraft] = useState<{ projectId: string; itemId: string } | null>(null);
  const draftRef = useRef<{ projectId: string; itemId: string } | null>(null);
  /** pitanje „od kog elementa je ram“ pre dodavanja rama oko platna */
  const [frameAsk, setFrameAsk] = useState(false);
  /** strane rama koje se prave (45° samo na uglovima gde se dve strane sastaju) */
  const [frameSides, setFrameSides] = useState(ALL_FRAME_SIDES);
  /** dodavanje šarki: strana i broj, pa izbor šarke */
  const [hingeAsk, setHingeAsk] = useState<{ side: 'left' | 'right'; count: number } | null>(null);
  /** pomeraj crteža (za pogled) i zahtev za uklapanje pogleda posle dodavanja/brisanja rama, poništavanja i slično */
  const [viewShift, setViewShift] = useState({ dx: 0, dy: 0, n: 0 });
  const [fitTick, setFitTick] = useState(0);
  /** prikaz kota (ukupna širina i visina crteža); može da se isključi */
  const [showDims, setShowDims] = useState(true);
  const [hist, setHist] = useState<{ past: CustomModel[]; future: CustomModel[] }>({ past: [], future: [] });
  const [activeId, setActiveId] = useState<string | null>(null);
  /** izabrani delovi (Ctrl + klik ili okvir za više); jedan izabran deo ima pun panel, više delova zajednički */
  const [selectedIdsRaw, setSelectedIds] = useState<string[]>([]);
  const setSelectedId = useCallback((id: string | null) => setSelectedIds(id ? [id] : []), []);
  const [view, setView] = useState<ViewMode>('2d');
  const [ortho, setOrtho] = useState(true);
  /** privlačenje ivica i krajeva uz susedne delove (Alt pri crtanju privremeno isključuje) */
  const [snapObjects, setSnapObjects] = useState(true);
  /** slobodno crtanje: dozvoljeno je sve (preklapanja, nagnute cevi, nejednaki razmaci); pri povratku se nabraja šta nije u redu */
  const [free, setFree] = useState(false);
  const freeRef = useRef(false);
  freeRef.current = free;
  const [checkOpen, setCheckOpen] = useState(false);
  const [grid, setGrid] = useState(5);
  const [rep, setRep] = useState({ count: 5, step: 100 });
  /** obaveštenje (napomena) zašto operacija nije izvršena */
  const [notice, setNotice] = useState<string | null>(null);
  const [sketchBusy, setSketchBusy] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  /** u izboru za zamenu materijala prikazuju se i materijali koji podrazumevano nisu ponuđeni */
  const [showAllSwap, setShowAllSwap] = useState(false);
  /** potvrda za „sačuvaj na istom tipu“ / „vrati original“ kod dorade modela iz kataloga */
  const fromDorada = Boolean((useLocation().state as { dorada?: boolean } | null)?.dorada);
  const [typeAction, setTypeAction] = useState<'replace' | 'restore' | null>(null);
  /** izabrana zamena materijala koja čeka potvrdu (kad se menja i još neki deo) */
  const [pendingSwap, setPendingSwap] = useState<{ ids: string[]; materialId: string } | null>(null);
  const modelRef = useRef(model);
  modelRef.current = model;
  const materialsRef = useRef(materials);
  materialsRef.current = materials;

  const record = useCallback(() => setHist((h) => ({ past: [...h.past.slice(-99), modelRef.current], future: [] })), []);
  /**
   * Izmena crteža. Vraća false (i piše obaveštenje) kad bi izmena napravila preklapanje delova; tada se ništa ne menja.
   * Uklopljene prečke se posle izmene vraćaju unutar svojih U profila.
   */
  const change = useCallback((fn: (m: CustomModel) => CustomModel, keep = true, norm = true): boolean => {
    const cur = modelRef.current;
    const raw = fn(cur);
    if (raw === cur) return true;
    const st = settle(raw, materialsRef.current, norm, freeRef.current);
    const next = st.model;
    // crtež se pomerio ka početku koordinata: pogled ide za njim, pa deo ostaje na istom mestu na ekranu
    if (st.dx !== 0 || st.dy !== 0) setViewShift((v) => ({ dx: st.dx, dy: st.dy, n: v.n + 1 }));
    const bad = freeRef.current ? null : checkNewOverlap(cur, next, materialsRef.current);
    if (bad) { setNotice(bad); return false; }
    if (keep) setHist((h) => ({ past: [...h.past.slice(-99), cur], future: [] }));
    const upd = { ...next, updatedAt: new Date().toISOString() };
    modelRef.current = upd;
    setModel(upd);
    setNotice(null);
    return true;
  }, []);
  const undo = useCallback(() => setHist((h) => { if (!h.past.length) return h; setModel(h.past[h.past.length - 1]); setFitTick((t) => t + 1); return { past: h.past.slice(0, -1), future: [modelRef.current, ...h.future] }; }), []);
  const redo = useCallback(() => setHist((h) => { if (!h.future.length) return h; setModel(h.future[0]); setFitTick((t) => t + 1); return { past: [...h.past, modelRef.current], future: h.future.slice(1) }; }), []);

  // čuvanje: model se upisuje u podešavanja čim ima bar jedan deo (ili je već sačuvan), pa se izmene ne gube
  useEffect(() => {
    const st = useAppStore.getState();
    const list = st.settings.customModels ?? [];
    const saved = list.find((m) => m.id === model.id);
    if (saved === model || (!saved && model.parts.length === 0)) return;
    st.updateSettings({ customModels: saved ? list.map((m) => (m.id === model.id ? model : m)) : [...list, model] });
  }, [model]);

  // promena materijala (npr. debljine zida U profila) menja kanal: uklopljene prečke se vraćaju u nove granice, a delovi u okvir
  useEffect(() => {
    // i pri otvaranju: model sačuvan pre pravila o okviru se odmah vraća u okvir
    const next = settle(modelRef.current, materials, false).model;
    if (next !== modelRef.current) { modelRef.current = next; setModel(next); }
  }, [materials]);

  const parts = useMemo(() => resolveParts(model, materials), [model, materials]);
  const active = activeId ? materials.find((m) => m.id === activeId) ?? null : null;
  // izbor posle poništavanja ili brisanja zadržava samo delove koji postoje
  const selectedIds = useMemo(() => selectedIdsRaw.filter((x) => model.parts.some((p) => p.id === x)), [selectedIdsRaw, model.parts]);
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const sel = parts.find((r) => r.part.id === selectedId) ?? null;
  const multi = selectedIds.length > 1 ? parts.filter((r) => selectedIds.includes(r.part.id)) : [];
  const bom = useMemo(() => customBom(model, materials), [model, materials]);
  /** provera crteža (posle slobodnog crtanja ili na dugme); menja se uživo dok se problemi ispravljaju */
  const deferredModel = useDeferredValue(model);
  const allProblems = useMemo(() => (free || view === 'mere' ? null : checkDrawing(deferredModel, materials)), [free, view, deferredModel, materials]);
  const acceptedSet = useMemo(() => new Set(model.acceptedWarnings ?? []), [model.acceptedWarnings]);
  const activeProblems = allProblems ? allProblems.filter((p) => !acceptedSet.has(p.key)) : null;
  const acceptedProblems = allProblems ? allProblems.filter((p) => acceptedSet.has(p.key)) : [];
  /** radnik prihvata upozorenje (ili ga vraća): pamti se uz model, a geometrija se ne menja */
  const setAccepted = (key: string, on: boolean) => change((m) => {
    const cur = new Set(m.acceptedWarnings ?? []);
    if (on) cur.add(key); else cur.delete(key);
    return { ...m, acceptedWarnings: cur.size ? [...cur] : undefined };
  }, false);
  // klizna kapija: klizni okov (točkići, šina, valjci, graničnici …) se crta preko crteža krila i podešava u panelu desno
  const [hwSel, setHwSel] = useState<string | null>(null);
  const slSpec = model.kind === 'gate' && model.gate?.gateType === 'sliding' ? model.gate.sliding : undefined;
  const slGate = useMemo(() => (slSpec ? { ...createGate('sliding', { sliding: { ...slSpec, drawnLeaf: true }, heightMm: model.heightMm + slSpec.frameBottomY, opening: model.gate?.opening ?? 'right', color: model.color }), id: model.id } : null), [slSpec, model.heightMm, model.gate?.opening, model.color, model.id]);
  const slPlaced = useMemo(() => (slGate ? placeSliding(slGate, { clearStart: 0, clearEnd: model.widthMm, clearWidth: model.widthMm }) : null), [slGate, model.widthMm]);
  const slBounds = useMemo(() => (slPlaced && slSpec ? { x0: slPlaced.minX, y0: -slSpec.frameBottomY - 320, x1: slPlaced.maxX, y1: model.heightMm + 160 } : null), [slPlaced, slSpec, model.heightMm]);
  const patchSliding = (p: Partial<SlidingSpec>) => change((m) => (m.gate?.sliding ? { ...m, gate: { ...m.gate, sliding: { ...m.gate.sliding, ...p } } } : m));
  const hwSelValid = hwSel && slSpec && partDef(hwSel) ? hwSel : null;
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
  /** zamena materijala izabranog dela; delovi koji moraju zajedno (suprotni U profil, ostale prečke grupe) menjaju se uz potvrdu */
  const swapMaterial = (ids: string[], materialId: string) => {
    let m = modelRef.current;
    for (const id of ids) {
      const p = m.parts.find((x) => x.id === id);
      if (!p || p.materialId === materialId) continue; // već zamenjen zajedno sa nekim drugim delom (par U profila, grupa prečki)
      const r = replaceMaterial(m, id, materialId, materialsRef.current);
      if ('error' in r) { setNotice(r.error); return; }
      m = r.model;
    }
    change(() => m);
  };
  /** svi delovi koji bi se zamenili (izabrani i oni koji moraju sa njima); potvrda se traži kad ih je više od izabranih */
  const swapTargets = (ids: string[]): string[] => [...new Set(ids.flatMap((id) => replaceTargets(modelRef.current, id)))];
  const askSwap = (ids: string[], materialId: string) => {
    if (!materialId) return;
    const all = swapTargets(ids);
    if (all.length > 1 && (ids.length === 1 || all.length > ids.length)) setPendingSwap({ ids, materialId }); else swapMaterial(ids, materialId);
  };
  const removeSel = useCallback(() => { if (!selectedIds.length) return; const del = new Set(selectedIds); change((m) => ({ ...m, parts: m.parts.filter((p) => !del.has(p.id)) })); setSelectedIds([]); }, [selectedIds, change]);
  /** kopirani delovi (Ctrl + C) i delovi koji su nalepljeni (Ctrl + V) pa prate pokazivač dok se ne postave klikom */
  const clip = useRef<CustomPart[]>([]);
  const [placing, setPlacing] = useState<CustomPart[] | null>(null);
  const placingParts = useMemo(() => (placing?.length ? resolveParts({ ...model, parts: placing }, materials) : null), [placing, model, materials]);
  const copySel = useCallback(() => {
    if (!selectedIds.length) return;
    const ids = new Set(selectedIds);
    clip.current = modelRef.current.parts.filter((p) => ids.has(p.id)).map((p) => JSON.parse(JSON.stringify(p)) as CustomPart);
  }, [selectedIds]);
  const pasteClip = useCallback(() => {
    if (!clip.current.length) return;
    setActiveId(null);
    setPlacing(clip.current.map((p) => ({ ...p })));
  }, []);
  /** nalepljeni delovi dobijaju nove ID-ove i postavljaju se pomereni za (dx, dy); prečke vezane za bočne profile koji nisu kopirani se odvezuju */
  const placeClip = (dx: number, dy: number) => {
    if (!placing?.length) return;
    const ids = new Map(placing.map((p) => [p.id, uid('part')]));
    const copies = placing.map((p): CustomPart => {
      const g = p.guides && ids.has(p.guides[0]) && ids.has(p.guides[1]) ? ([ids.get(p.guides[0])!, ids.get(p.guides[1])!] as [string, string]) : undefined;
      const moved = { ...p, id: ids.get(p.id)!, x: p.x + dx, y: p.y + dy, guides: g };
      return freeRef.current ? moved : restOnSurface(modelRef.current, moved, materialsRef.current);
    });
    if (change((m) => ({ ...m, parts: [...m.parts, ...copies] }))) { setSelectedIds(copies.map((c) => c.id)); setPlacing(null); }
  };
  const duplicateSel = useCallback(() => {
    const p = modelRef.current.parts.find((x) => x.id === selectedId);
    if (!p) return;
    const copy = { ...p, id: uid('part'), x: p.x + 50, y: p.y + 50 };
    if (change((m) => ({ ...m, parts: [...m.parts, copy] }))) setSelectedId(copy.id);
  }, [selectedId, change]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as Element).closest('input,select,textarea')) return;
      if (e.key === 'Escape') { setActiveId(null); setPlacing(null); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); copySel(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClip(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSel(); return; }
      if (!selectedIds.length) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSel(); return; }
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
      if (d) { e.preventDefault(); const ids = new Set(selectedIds); change((m) => ({ ...m, parts: m.parts.map((x) => (ids.has(x.id) ? { ...x, x: x.x + d[0] * grid, y: x.y + d[1] * grid } : x)) })); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds, grid, undo, redo, removeSel, duplicateSel, change, copySel, pasteClip]);

  /** Ram oko platna od izabranog profila (uglovi pod 45°); vidi domain/models/frame.ts */
  const addFrame = (materialId: string) => {
    setFrameAsk(false);
    const next = modelWithFrame(modelRef.current, materialsRef.current.find((x) => x.id === materialId), materialsRef.current, undefined, frameSides);
    if ('error' in next) { setNotice(next.error); return; }
    if (change(() => next)) { setSelectedIds(frameIds(next)); setFitTick((t) => t + 1); }
  };
  /** briše ram dodat dugmetom „Dodaj ram“; mere modela se vraćaju na mere platna */
  /** nova širina / visina celog crteža; sa ramom se razvlači platno unutar njega (ram zadržava debljinu) */
  const resizeTo = (w: number, h: number): boolean => {
    const next = resizeWithFrame(modelRef.current, w, h, materialsRef.current);
    if ('error' in next) { setNotice(next.error); return false; }
    return change(() => next);
  };
  /** šarke duž jedne ivice kapije; leže na ramu ili krilu */
  const addHinges = (materialId: string) => {
    const ask = hingeAsk;
    setHingeAsk(null);
    const mat = materialsRef.current.find((x) => x.id === materialId);
    if (!mat || !ask) return;
    const made = hingesAlongEdge(modelRef.current, mat, ask.side, ask.count, materialsRef.current);
    if (!made.length) { setNotice('Šarke se dodaju na nacrtanu kapiju: prvo nacrtajte platno ili ram.'); return; }
    if (change((m) => ({ ...m, parts: [...m.parts, ...made] }))) setSelectedIds(made.map((q) => q.id));
  };
  /** okretanje preseka rama: okreće se ceo ram (sva četiri dela), pa uglovi ostaju spojeni */
  const rotateFrame = (rot: number) => {
    const next = modelWithRotatedFrame(modelRef.current, rot, materialsRef.current);
    if ('error' in next) { setNotice(next.error); return; }
    if (change(() => next)) { setSelectedIds(frameIds(next)); setFitTick((t) => t + 1); }
  };
  const removeFrame = () => { if (change((m) => modelWithoutFrame(m))) { setSelectedIds([]); setFitTick((t) => t + 1); } };

  const openGateMeasures = () => {
    const cur = modelRef.current;
    if (cur.parts.length === 0) { setNotice('Prvo nacrtajte bar jedan deo kapije; tek tada se otvaraju mere kapije.'); return; }
    const d = useAppStore.getState().createGateDraft(cur.id);
    if (!d) { setNotice('Model kapije još nije sačuvan. Pokušajte ponovo za trenutak.'); return; }
    draftRef.current = d;
    setDraft(d);
    setView('mere');
  };
  /** završava izmenu mera: podešavanja kapije se čuvaju uz model (nova verzija samo ako su se stvarno promenila) */
  const closeGateMeasures = () => {
    const dr = draftRef.current;
    if (!dr) return;
    draftRef.current = null;
    const cur = modelRef.current;
    const version = cur.gate?.version ?? 1;
    let cfg = useAppStore.getState().finishGateDraft(dr.projectId, version);
    setDraft(null);
    if (!cfg) return;
    const same = JSON.stringify({ ...cfg, version: 0 }) === JSON.stringify({ ...(cur.gate ?? {}), version: 0 });
    if (!same) cfg = { ...cfg, version: version + 1 };
    const next = cfg;
    // mere modela proizlaze iz crteža: podešavanja kapije se čuvaju uz model, a crtež se ne razvlači
    if (!same) change((m) => ({ ...m, gate: next }), false);
  };
  /** izbor prikaza; napuštanje „Mere kapije“ čuva izmenjena podešavanja */
  const selectView = (v: ViewMode) => {
    if (v === 'mere') { if (!draftRef.current) openGateMeasures(); else setView('mere'); return; }
    closeGateMeasures();
    setView(v);
  };
  // odlazak sa strane dok su mere otvorene: podešavanja se upisuju u model, a privremen projekat se uklanja
  useEffect(() => () => {
    const dr = draftRef.current;
    if (!dr) return;
    draftRef.current = null;
    const st = useAppStore.getState();
    const cur = modelRef.current;
    const version = cur.gate?.version ?? 1;
    const cfg = st.finishGateDraft(dr.projectId, version);
    if (!cfg) return;
    const same = JSON.stringify({ ...cfg, version: 0 }) === JSON.stringify({ ...(cur.gate ?? {}), version: 0 });
    if (same) return;
    const list = st.settings.customModels ?? [];
    if (list.some((m) => m.id === cur.id)) st.updateSettings({ customModels: list.map((m) => (m.id === cur.id ? { ...cur, gate: { ...cfg, version: version + 1 }, updatedAt: new Date().toISOString() } : m)) });
  }, []);

  return (
    <div className="h-full flex flex-col min-h-0" data-testid="model-designer">
      {hingeAsk && (
        <Modal title="Dodaj šarke" onClose={() => setHingeAsk(null)}>
          <p className="text-sm text-muted mb-3">Šarke se postavljaju duž jedne ivice kapije, ravnomerno od gornje do donje (prve i poslednje na 150 mm od ivice), i leže na ramu ili krilu. Posle toga se svaka može pomeriti.</p>
          <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
            <label className="flex flex-col gap-1">Strana šarki
              <select className="input" data-testid="hinge-side" value={hingeAsk.side} onChange={(e) => setHingeAsk({ ...hingeAsk, side: e.target.value as 'left' | 'right' })}><option value="left">Levo</option><option value="right">Desno</option></select></label>
            <label className="flex flex-col gap-1">Broj šarki
              <select className="input" data-testid="hinge-count" value={hingeAsk.count} onChange={(e) => setHingeAsk({ ...hingeAsk, count: Number(e.target.value) })}>{[2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          </div>
          <MaterialPicker materials={materials.filter(isHingeMaterial)} placeholder="— izaberite šarku —" testId="hinge-material" ariaLabel="Šarka" onPick={addHinges} />
        </Modal>
      )}
      {frameAsk && (
        <Modal title="Dodaj ram" onClose={() => setFrameAsk(false)}>
          <p className="text-sm text-muted mb-3">Od kog elementa je ram? Ram se crta oko platna, uglovi se seku pod 45°, a model se uvećava za širinu profila sa svake strane koja je izabrana. Ugao od 45° je samo tamo gde se dve strane sastaju; slobodan kraj je ravan.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-sm" role="group" aria-label="Strane rama" data-testid="frame-sides">
            {([['left', 'Levo'], ['right', 'Desno'], ['top', 'Gore'], ['bottom', 'Dole']] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-1.5"><input type="checkbox" data-testid={`frame-side-${k}`} checked={frameSides[k]} onChange={(e) => setFrameSides((s) => ({ ...s, [k]: e.target.checked }))} />{l}</label>
            ))}
          </div>
          {!frameSides.left && !frameSides.right && !frameSides.top && !frameSides.bottom && <p className="text-[12.5px] text-[#b42318] mb-2" role="alert">Izaberite bar jednu stranu rama.</p>}
          <MaterialPicker materials={materials.filter((m) => materialShape(m).type === 'linear')} placeholder="— izaberite profil rama —" testId="frame-material" ariaLabel="Profil rama" onPick={(id) => { if (frameSides.left || frameSides.right || frameSides.top || frameSides.bottom) addFrame(id); }} />
        </Modal>
      )}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-line bg-white">
        <Link to={model.kind === 'gate' ? '/modeli-kapija' : isTerrace ? '/modeli-terasa' : '/modeli'} className="btn btn-sm" data-testid="designer-back"><ArrowLeft size={15} />{model.kind === 'gate' ? 'Modeli kapija' : isTerrace ? 'Modeli ograda za terase' : 'Modeli'}</Link>
        <input className="input !w-56 !py-1.5 font-semibold" aria-label="Naziv modela" data-testid="designer-name" value={model.name} onChange={(e) => change((m) => ({ ...m, name: e.target.value }), false)} />
        {/* ograda za terasu ostaje ograda za terasu (posebna stranica i materijali); ograda i kapija se mogu menjati jedna u drugu */}
        {isTerrace && <span className="pill !text-[12.5px] bg-[#eff8ff] text-[#175cd3]" data-testid="designer-kind-terrace">Ograda za terasu</span>}
        {/* u prikazu „Mere kapije“ alati crtanja se sklanjaju: mere se menjaju samo u tom prikazu, pa crtež i podešavanja ne mogu da se razilaze */}
        {view !== 'mere' && !isTerrace && <select className="input !w-auto !py-1.5" aria-label="Vrsta" data-testid="designer-kind" value={model.kind} onChange={(e) => change((m) => ({ ...m, kind: e.target.value as CustomModel['kind'], gate: e.target.value === 'gate' ? m.gate ?? defaultGateConfig() : m.gate }))}>
          {Object.entries(CUSTOM_KIND_LABELS).filter(([k]) => k !== 'terrace').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>}
        {model.kind === 'gate' && view !== 'mere' && (
          <select className="input !w-auto !py-1.5" aria-label="Tip kapije" data-testid="designer-gate-type" value={model.gate?.gateType ?? 'pedestrian'}
            onChange={(e) => change((m) => ({ ...m, gate: { ...defaultGateConfig(e.target.value as GateType), clearWidthMm: m.gate?.clearWidthMm, version: m.gate?.version ?? 1 } }))}>
            {(Object.keys(GATE_TYPE_LABELS) as GateType[]).map((t) => <option key={t} value={t}>{GATE_TYPE_LABELS[t]}</option>)}
          </select>
        )}
        {view !== 'mere' && <>
        <Num label="Širina" value={model.widthMm} min={50} max={20000} testId="designer-width" onChange={(v) => resizeTo(Math.round(v), modelRef.current.heightMm)} />
        {/* klizna kapija: visina je ukupna visina od tla (do vrha krila), isto kao ograda i stubovi; crtež je krilo, podignuto od tla */}
        <Num label="Visina" value={model.heightMm + (slSpec?.frameBottomY ?? 0)} min={50 + (slSpec?.frameBottomY ?? 0)} max={6000} testId="designer-height" onChange={(v) => resizeTo(modelRef.current.widthMm, Math.round(v) - (modelRef.current.gate?.sliding?.frameBottomY ?? 0))} />
        <label className="flex items-center gap-1.5 text-[13px]" title="Ukupna širina i visina crteža; mere modela proizlaze iz crteža"><input type="checkbox" checked={showDims} data-testid="designer-dims" onChange={(e) => setShowDims(e.target.checked)} />Kote</label>
        <button type="button" className="input !w-auto !py-1.5 inline-flex items-center gap-2" aria-label={`Boja: ${normalizeColorKey(model.color)}. Otvori kartu boja`} data-testid="designer-color" onClick={() => setChartOpen(true)}>
          <span className="w-5 h-5 rounded-full ring-1 ring-black/20" style={{ background: colorHex(model.color) }} />{normalizeColorKey(model.color)}
        </button>
        {chartOpen && <ColorChartModal value={normalizeColorKey(model.color)} favorites={settings.favoriteColors ?? []} onPick={(k) => change((m) => ({ ...m, color: k }))} onFavorites={(list) => useAppStore.getState().updateSettings({ favoriteColors: list })} onClose={() => setChartOpen(false)} />}
        {model.kind === 'gate' && !slSpec && <button className="btn btn-sm" data-testid="designer-add-hinges" title="Dodaje šarke duž jedne ivice kapije" onClick={() => setHingeAsk({ side: model.gate?.opening ?? 'right', count: 2 })}>Dodaj šarke</button>}
        <button className="btn btn-sm" data-testid="designer-add-frame" title="Dodaje ram oko platna (uglovi pod 45°)" onClick={() => setFrameAsk(true)}>Dodaj ram</button>
        {model.parts.some(isFramePart) && <button className="btn btn-sm" data-testid="designer-remove-frame" title="Briše dodat ram; mere modela se vraćaju na mere platna" onClick={removeFrame}><Trash2 size={14} />Obriši ram</button>}
        </>}
        <div className="flex-1" />
        {view !== 'mere' && <>
        <button type="button" className={`btn btn-sm ${free ? 'btn-primary' : ''}`} data-testid="designer-free" aria-pressed={free} title="Slobodno crtanje: dozvoljeno je sve (preklapanje delova, proizvoljni uglovi, nejednaki razmaci). Pri povratku na normalno crtanje prikazuje se šta nije u redu."
          onClick={() => { if (free) { setFree(false); setCheckOpen(true); } else { setFree(true); setCheckOpen(false); } }}>{free ? 'Normalno crtanje' : 'Slobodno crtanje'}</button>
        {!free && <button type="button" className={`btn btn-sm ${activeProblems?.length ? '!border-[#fda29b] !text-[#b42318]' : ''}`} data-testid="designer-check" aria-pressed={checkOpen} title="Upozorenja za crtež: preklapanja, krive cevi i nejednaki razmaci. Upozorenje koje ima smisla možete da prihvatite." onClick={() => setCheckOpen((o) => !o)}><AlertTriangle size={14} />Upozorenja ({activeProblems?.length ?? 0})</button>}
        <label className="flex items-center gap-1.5 text-[13px]" title="Ivice i krajevi dela koji crtate, pomerate ili lepite privlače se uz ivice susednih delova i tlo. Držite Alt da privremeno isključite."><input type="checkbox" checked={snapObjects} data-testid="designer-snap" onChange={(e) => setSnapObjects(e.target.checked)} />Privlačenje</label>
        <label className="flex items-center gap-1.5 text-[13px]" title="Profili se crtaju samo vodoravno ili uspravno"><input type="checkbox" checked={ortho} data-testid="designer-ortho" onChange={(e) => setOrtho(e.target.checked)} />Pod pravim uglom</label>
        <select className="input !w-auto !py-1.5" aria-label="Korak mreže" value={grid} onChange={(e) => setGrid(Number(e.target.value))}>
          {[1, 5, 10, 50].map((g) => <option key={g} value={g}>korak {g} mm</option>)}
        </select>
        <button className="btn btn-sm btn-icon" aria-label="Poništi" disabled={!hist.past.length} onClick={undo}><Undo2 size={16} /></button>
        <button className="btn btn-sm btn-icon" aria-label="Ponovi izmenu" disabled={!hist.future.length} onClick={redo}><Redo2 size={16} /></button>
        </>}
        <div className="inline-flex rounded-lg border border-line overflow-hidden" role="group" aria-label="Prikaz">
          {([['2d', '2D'], ['split', '2D + 3D'], ['3d', '3D'], ['skica', 'Skica'], ...(model.kind === 'gate' ? [['mere', 'Mere kapije']] : [])] as [ViewMode, string][]).map(([v, l]) => (
            <button key={v} data-testid={v === 'mere' ? 'designer-gate-measures' : `designer-view-${v}`} aria-pressed={view === v} className={`px-3 py-1.5 text-[13px] font-semibold ${view === v ? 'bg-brand-black text-white' : 'bg-white hover:bg-slate-50'}`} onClick={() => selectView(v)}>{l}</button>
          ))}
        </div>
      </div>

      {/* traka dorade se vidi samo odmah posle klika na „Doradi“ (i dok dorađen crtež zamenjuje original); kasnije otvaranje crteža je običan model */}
      {model.baseModelId && FENCE_MODELS[model.baseModelId as FenceModelId] && (fromDorada || model.replaces) && (() => {
        const baseName = FENCE_MODELS[model.baseModelId as FenceModelId].name;
        // posle zamene ili vraćanja crtež se ponovo učitava iz podešavanja (naziv i oznaka zamene)
        const reload = () => { const saved = useAppStore.getState().settings.customModels?.find((m) => m.id === modelRef.current.id); if (saved) { modelRef.current = saved; setModel(saved); } };
        return (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-[#eff8ff] border-b border-[#b2ddff] text-[13px]" data-testid="rework-bar">
            {model.replaces
              ? <span className="flex-1 min-w-[240px]">Dorada modela <b>{baseName}</b>: ovaj crtež je sada taj model iz kataloga (isti tip). Projekti sa ovim modelom koriste dorađen crtež.</span>
              : <span className="flex-1 min-w-[240px]">Dorada modela <b>{baseName}</b>: izmene se čuvaju kao <b>nov tip</b> „{model.name}“, a original ostaje. Ako želite da ovo bude isti model, sačuvajte na istom tipu.</span>}
            {model.replaces
              ? <button className="btn btn-sm" data-testid="rework-restore" onClick={() => setTypeAction('restore')}>Vrati originalni model</button>
              : <button className="btn btn-sm btn-primary" data-testid="rework-replace" onClick={() => setTypeAction('replace')}>Sačuvaj na istom tipu</button>}
            {typeAction && (
              <ConfirmDialog title={typeAction === 'replace' ? 'Sačuvaj na istom tipu' : 'Vrati originalni model'} confirmLabel={typeAction === 'replace' ? 'Sačuvaj na istom tipu' : 'Vrati original'}
                message={typeAction === 'replace'
                  ? <>Dorađen crtež postaje model <b>{baseName}</b>: stoji umesto originala u izboru modela, a <b>projekti koji koriste ovaj model prelaze na dorađen crtež</b>. Original se može vratiti na strani Modeli ograda.</>
                  : <>Model <b>{baseName}</b> se vraća na original iz kataloga i projekti ponovo dobijaju originalni crtež. Ovaj crtež ostaje kao nov tip „{baseName} — dorada“.</>}
                onCancel={() => setTypeAction(null)}
                onConfirm={() => { const st = useAppStore.getState(); if (typeAction === 'replace') st.replaceBuiltin(model.id); else st.restoreBuiltin(model.id); setTypeAction(null); reload(); }} />
            )}
          </div>
        );
      })()}
      {slSpec && view !== 'mere' && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-line bg-[#f8fafc]" data-testid="designer-sliding-bar">
          <span className="text-[13px] font-semibold">Klizni okov:</span>
          <SlidingPartButtons spec={slSpec} selected={hwSelValid} onSpec={patchSliding} onSelect={(k) => { setHwSel(k); if (k) setSelectedIds([]); }} />
        </div>
      )}
      {free && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-[#fedf89] bg-[#fffaeb] text-[13px] text-[#93370d]" role="status" data-testid="designer-free-bar">
          <AlertTriangle size={16} className="shrink-0" />
          <span className="flex-1 min-w-[240px]"><b>Slobodno crtanje:</b> sve je dozvoljeno — delovi mogu da se preklapaju, uglovi i razmaci su proizvoljni, prečke se ne uklapaju u U profile. Kad se vratite na normalno crtanje, ispisaće se šta nije u redu.</span>
          <button className="btn btn-sm" data-testid="designer-free-off" onClick={() => { setFree(false); setCheckOpen(true); }}>Vrati normalno crtanje</button>
        </div>
      )}
      {checkOpen && !free && activeProblems && (
        <div className={`px-3 py-2 border-b text-[13px] ${activeProblems.length ? 'bg-[#fef3f2] border-[#fecdca] text-[#b42318]' : 'bg-[#ecfdf3] border-[#abefc6] text-[#067647]'}`} data-testid="designer-problems">
          <div className="flex items-center gap-2">
            {activeProblems.length ? <AlertTriangle size={16} className="shrink-0" /> : null}
            <b className="flex-1">{activeProblems.length ? `Provera crteža: ${activeProblems.length} ${activeProblems.length === 1 ? 'problem' : 'problema'}` : 'Provera crteža: sve je u redu — nema preklapanja, krivih cevi ni nejednakih razmaka.'}</b>
            <button className="shrink-0 p-0.5 rounded hover:bg-black/5" aria-label="Zatvori proveru" data-testid="designer-problems-close" onClick={() => setCheckOpen(false)}><X size={15} /></button>
          </div>
          {activeProblems.length > 0 && (
            <ul className="mt-1 space-y-1 max-h-44 overflow-auto scroll-thin">
              {activeProblems.map((pr) => (
                <li key={pr.key} className="flex items-start gap-2">
                  <button className="text-left hover:underline flex-1" data-testid={`designer-problem-${pr.kind}`} title="Izaberi na crtežu" onClick={() => { setSelectedIds(pr.ids); setHwSel(null); }}>• {pr.msg}</button>
                  <button className="btn btn-sm shrink-0 !py-0.5" data-testid="designer-problem-accept" title="Saglasan sam: upozorenje se više ne prikazuje (ostaje na spisku prihvaćenih)" onClick={() => setAccepted(pr.key, true)}>Prihvatam</button>
                </li>
              ))}
            </ul>
          )}
          {acceptedProblems.length > 0 && (
            <details className="mt-1 text-slate-700" data-testid="designer-accepted">
              <summary className="cursor-pointer select-none">Prihvaćena upozorenja ({acceptedProblems.length})</summary>
              <ul className="mt-1 space-y-1">
                {acceptedProblems.map((pr) => (
                  <li key={pr.key} className="flex items-start gap-2">
                    <span className="flex-1">• {pr.msg}</span>
                    <button className="btn btn-sm shrink-0 !py-0.5" data-testid="designer-problem-restore" onClick={() => setAccepted(pr.key, false)}>Vrati</button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 px-3 py-2 bg-[#fef3f2] border-b border-[#fecdca] text-[13px] text-[#b42318]" role="alert" data-testid="designer-notice">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{notice}</span>
          <button className="shrink-0 p-0.5 rounded hover:bg-[#fee4e2]" aria-label="Zatvori obaveštenje" onClick={() => setNotice(null)}><X size={15} /></button>
        </div>
      )}
      {view === 'mere' && draft && (
        <div className="flex-1 min-h-0"><GateDesignModal projectId={draft.projectId} itemId={draft.itemId} embedded inline onClose={() => selectView('2d')} /></div>
      )}
      <div className={`flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)_350px] ${view === 'mere' ? 'hidden' : ''}`}>
        <aside className="border-r border-line bg-white min-h-0 max-h-[40vh] lg:max-h-none"><Palette materials={paletteMaterials} activeId={activeId} onPick={(m) => { setActiveId(m); if (m) setSelectedId(null); }}
          terrace={isTerrace} showAll={{ checked: showAllMaterials, onChange: setShowAllMaterials }} /></aside>

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
            <Designer2D model={model} parts={parts} active={active} selectedIds={selectedIds} ortho={ortho} gridMm={grid} snapObjects={snapObjects}
              onSelect={(ids) => { setSelectedIds(ids); if (ids.length) setHwSel(null); }} placing={placingParts} onPlace={placeClip} showDims={showDims} viewShift={viewShift} fitTick={fitTick} onMoveEnd={() => change((m) => ({ ...m }), false)}
              groundY={slSpec ? slSpec.frameBottomY : 0} extraBounds={slBounds} onOverlayPick={(c, member) => { const k = compPart(c); if (k) { setHwSel(k); setSelectedIds([]); useAppStore.getState().setTailSel(model.id, k === 'tail' ? member ?? null : null); } }}
              underlay={slGate ? (px) => <SlidingAssemblyArt gate={slGate} clearStart={0} clearEnd={model.widthMm} clearWidth={model.widthMm} floorY={slSpec!.frameBottomY} px={px} hex={colorHex(model.color)} noLeaf layer="back" testPct={0} onPartClick={() => undefined} highlight={hwSelValid ? partDef(hwSelValid)?.comps : undefined} /> : undefined}
              overlay={slGate ? (px) => <SlidingAssemblyArt gate={slGate} clearStart={0} clearEnd={model.widthMm} clearWidth={model.widthMm} floorY={slSpec!.frameBottomY} px={px} hex={colorHex(model.color)} noLeaf layer="front" testPct={0} onPartClick={() => undefined} highlight={hwSelValid ? partDef(hwSelValid)?.comps : undefined} /> : undefined}
              onAdd={(p0) => { const p = free ? p0 : restOnSurface(modelRef.current, p0, materialsRef.current); const next = { ...modelRef.current, parts: [...modelRef.current.parts, p] }; const fitted = !free && p.angleDeg === 0 ? attach(next, p.id, true) : null; if (change(() => fitted ?? next)) setSelectedId(p.id); }}
              onMoveStart={record}
              onMove={(moves) => { const at = new Map(moves.map((v) => [v.id, v])); change((m) => ({ ...m, parts: m.parts.map((p) => { const v = at.get(p.id); return v ? { ...p, x: v.x, y: v.y } : p; }) }), false, false); }} />
          )}
          {view !== '2d' && view !== 'skica' && (
            <div className={`min-h-0 ${view === 'split' ? 'border-t xl:border-t-0 xl:border-l border-line' : ''}`}>
              <Suspense fallback={<div className="h-full grid place-items-center text-muted text-sm">Učitavanje 3D prikaza…</div>}>
                <Designer3D model={model} parts={parts} selectedId={selectedId ?? selectedIds[0] ?? null} sliding={slPlaced && slSpec ? { res: slPlaced.res, X: slPlaced.X, hex: colorHex(model.color), groundMm: slSpec.frameBottomY } : null} />
              </Suspense>
            </div>
          )}
        </section>

        <aside className="border-l border-line bg-white min-h-0 overflow-auto scroll-thin p-3">
          {slSpec && (hwSelValid || (!sel && !multi.length)) && <SlidingDesignerPanel slideId={model.id} spec={slSpec} W={model.widthMm} leafH={model.heightMm} onSpec={patchSliding} selected={hwSelValid} onSelect={setHwSel} />}
          <h2 className="font-bold text-[15px] mb-1">Izabrani deo</h2>
          {!sel && !multi.length && <p className="text-sm text-muted mb-4" data-testid="designer-no-selection">Izaberite materijal levo i nacrtajte ga na polju, ili kliknite na nacrtani deo da ga izmenite. Ctrl + klik ili prevlačenje po praznom biraju više delova.</p>}
          {multi.length > 0 && (() => {
            const ids = multi.map((r) => r.part.id);
            const first = multi[0];
            const sameMat = multi.every((r) => r.part.materialId === first.part.materialId);
            const linear = multi.every((r) => r.shape.type === 'linear');
            const noPiece = multi.every((r) => r.shape.type !== 'piece');
            const sheets = multi.every((r) => r.shape.type === 'sheet');
            /** vrednost polja: zajednička ako je ista kod svih, inače vrednost prvog dela uz napomenu */
            const common = (get: (p: CustomPart) => number) => { const v = get(first.part); return { value: v, same: multi.every((r) => Math.abs(get(r.part) - v) < 1e-6) }; };
            const setAll = (patch: Partial<CustomPart>) => { const s = new Set(ids); change((m) => ({ ...m, parts: m.parts.map((p) => (s.has(p.id) ? { ...p, ...patch } : p)) })); };
            const field = (label: string, get: (p: CustomPart) => number, apply: (v: number) => Partial<CustomPart>, o: { min?: number; max?: number; unit?: string; testId: string }) => {
              const c = common(get);
              return <Num key={o.testId} label={c.same ? label : `${label} (različito)`} value={c.value} min={o.min} max={o.max} unit={o.unit} testId={o.testId} onChange={(v) => setAll(apply(v))} />;
            };
            const options = sameMat ? replaceOptions(model, first.part.id, materials, showAllSwap) : [];
            const moreOptions = sameMat && replaceOptions(model, first.part.id, materials, true).length > replaceOptions(model, first.part.id, materials, false).length;
            const rot = common((p) => p.rot);
            const cut = multi.filter((r) => r.part.cut45).length;
            return (
              <div className="mb-4" data-testid="designer-multi">
                <div className="text-[13px] font-semibold">Izabrano delova: {multi.length}</div>
                <div className="text-[11.5px] text-muted mb-2">{sameMat ? (first.material?.name ?? 'Materijal je obrisan iz cenovnika') : 'različiti materijali'}. Izmena važi za sve izabrane delove; polje sa oznakom „različito“ prikazuje vrednost prvog dela.</div>
                <PartColorField testPrefix="multi" colors={multi.map((r) => r.part.color)} modelColor={model.color} onPick={(c) => change((m) => setPartsColor(m, ids, c))} />
                {options.length > 0 && (
                  <div className="grid gap-1 mb-2 text-[13px]">
                    <span className="text-slate-600">Zameni materijal (svim izabranim)</span>
                    <MaterialPicker materials={options} testId="multi-swap" ariaLabel="Zameni materijal svim izabranim" onPick={(id) => askSwap(ids, id)} showAll={{ checked: showAllSwap, onChange: setShowAllSwap, visible: moreOptions || showAllSwap }} />
                  </div>
                )}
                {multi.every((r) => r.part.guides) && (() => {
                  const fits = new Map(multi.map((r) => { const f = guideReport(model, r.part, materials)?.fit; return [r.part.id, f ? -f.minus : undefined]; }));
                  const ok = [...fits.values()].every((v) => v !== undefined);
                  return (
                    <button className="btn btn-sm btn-primary w-full mb-2" data-testid="multi-set-fit" disabled={!ok}
                      onClick={() => change((m) => ({ ...m, parts: m.parts.map((p) => (fits.has(p.id) ? { ...p, tiltDeg: fits.get(p.id) } : p)) }))}>
                      Postavi sve pod uglom uklapanja
                    </button>
                  );
                })()}
                {noPiece && field(sheets ? 'Širina' : 'Dužina', (p) => p.lengthMm, (v) => ({ lengthMm: v }), { min: 1, testId: 'multi-length' })}
                {sheets && field('Visina', (p) => p.heightMm ?? 0, (v) => ({ heightMm: v }), { min: 1, testId: 'multi-height' })}
                {!sheets && field('Ugao', (p) => p.angleDeg, (v) => ({ angleDeg: v }), { min: -360, max: 360, unit: '°', testId: 'multi-angle' })}
                {linear && multi.every((r) => r.shape.type === 'linear' && isSymmetricRect(r.shape.section)) && (() => {
                  const e = sectionFace((first.shape as { section: Section }).section, 0);
                  const same = multi.every((r) => r.shape.type === 'linear' && Math.abs(sectionFace(r.shape.section, 0).face - e.face) < 0.01 && Math.abs(sectionFace(r.shape.section, 0).depth - e.depth) < 0.01);
                  const pick = (r: number) => (multi.some((q) => isFramePart(q.part)) ? rotateFrame(r) : setAll({ rot: r }));
                  return <FaceChoice testPrefix="multi" a={e.u1 - e.u0} b={e.v1 - e.v0} firstPressed={rot.same && rot.value % 180 === 0} secondPressed={rot.same && rot.value % 180 === 90} mixed={!same || !rot.same} onPick={pick} />;
                })()}
                {linear && !multi.every((r) => r.shape.type === 'linear' && isSymmetricRect(r.shape.section)) && (
                  <div className="grid gap-1 py-1 text-[13px]">
                    <span className="text-slate-600">Okretanje preseka{rot.same ? '' : ' (različito)'}</span>
                    <span className="grid grid-cols-4 rounded-lg border border-line overflow-hidden">
                      {[0, 90, 180, 270].map((r) => <button key={r} data-testid={`multi-rot-${r}`} aria-pressed={rot.same && rot.value === r} className={`py-1 text-[12px] font-semibold ${rot.same && rot.value === r ? 'bg-brand-black text-white' : 'hover:bg-slate-50'}`} onClick={() => (multi.some((q) => isFramePart(q.part)) ? rotateFrame(r) : setAll({ rot: r }))}>{r}°</button>)}
                    </span>
                  </div>
                )}
                {linear && field('Nagib preseka (koso)', (p) => p.tiltDeg ?? 0, (v) => ({ tiltDeg: v || undefined }), { min: -90, max: 90, unit: '°', testId: 'multi-tilt' })}
                {linear && (
                  <label className="flex items-center justify-between gap-2 py-1 text-[13px]">
                    <span className="text-slate-600">Rez 45° (deo rama){cut > 0 && cut < multi.length ? ' (različito)' : ''}</span>
                    <input type="checkbox" data-testid="multi-cut45" checked={cut === multi.length} onChange={(e) => setAll({ cut45: e.target.checked || undefined })} />
                  </label>
                )}
                {field('Dubina (ka napred)', (p) => p.z, (v) => ({ z: v }), { min: -2000, max: 2000, testId: 'multi-z' })}
                {/* izabrana je cela grupa prečki (isti materijal, jedna iznad druge), možda uz druge delove: raspored prečki važi za grupu */}
                {(() => {
                  for (const r of multi) {
                    const grp = barGroup(model, r.part, materials);
                    if (!grp || grp.bars.length < 2 || !grp.bars.every((b) => ids.includes(b.id))) continue;
                    const lead = r.part; const old = new Set(grp.bars.map((b) => b.id));
                    return <BarLayoutBox key={`grp-${grp.bars.length}-${lead.id}`} model={model} bar={lead} materials={materials} onError={setNotice}
                      onApply={(m) => { if (change(() => m)) { const g = barGroup(m, lead, materials); if (g) setSelectedIds([...ids.filter((x) => !old.has(x)), ...g.bars.map((b) => b.id)]); } }} />;
                  }
                  return null;
                })()}
                <div className="flex gap-2 mt-2">
                  <button className="btn btn-sm flex-1" data-testid="multi-clear" onClick={() => setSelectedIds([])}>Poništi izbor</button>
                  <button className="btn btn-sm btn-danger flex-1" data-testid="multi-delete" onClick={removeSel}><Trash2 size={14} />Obriši sve</button>
                </div>
                <p className="text-[11.5px] text-muted mt-1.5">Položaj (X, Y) se menja prevlačenjem izabranih delova ili strelicama na tastaturi.</p>
              </div>
            );
          })()}
          {sel && (
            <div className="mb-4" data-testid="designer-props">
              <div className="text-[13px] font-medium leading-snug">{sel.material?.name ?? 'Materijal je obrisan iz cenovnika'}</div>
              <div className="text-[11.5px] text-muted mb-2">{sel.material?.sku}{sel.shape.type === 'linear' ? ` · presek ${sel.shape.section.w} × ${sel.shape.section.h} mm${sel.shape.exact ? '' : ' (približan oblik prema nazivu)'}` : ''}</div>
              {sel.material && (() => {
                const options = replaceOptions(model, sel.part.id, materials, showAllSwap);
                const moreOptions = replaceOptions(model, sel.part.id, materials, true).length > replaceOptions(model, sel.part.id, materials, false).length;
                if (!options.length && !moreOptions) return null;
                return (
                  <div className="grid gap-1 mb-2 text-[13px]">
                    <span className="text-slate-600">Zameni materijal</span>
                    <MaterialPicker materials={options} testId="part-swap" ariaLabel="Zameni materijal" onPick={(id) => askSwap([sel.part.id], id)} showAll={{ checked: showAllSwap, onChange: setShowAllSwap, visible: moreOptions || showAllSwap }} />
                  </div>
                );
              })()}
              {sel.shape.type === 'linear' && sel.shape.wall !== undefined && sel.material && (
                <div className="mb-1">
                  <Num label="Debljina zida" value={sel.shape.wall} min={0.5} max={20} testId="part-wall" onChange={(v) => useAppStore.getState().upsertMaterial({ ...sel.material!, wallMm: v })} />
                  <p className="text-[11.5px] text-muted -mt-0.5">{sel.shape.u ? <>Unutrašnji otvor U profila: <b data-testid="part-u-opening">{String(Math.round((sel.shape.u.a - 2 * sel.shape.u.c) * 100) / 100).replace('.', ',')} mm</b>. </> : null}Menja materijal u cenovniku, pa važi za sve delove od njega.</p>
                </div>
              )}
              <PartColorField testPrefix="part" colors={[sel.part.color]} modelColor={model.color} onPick={(c) => change((m) => setPartsColor(m, [sel.part.id], c))} />
              <Num label="X" value={sel.part.x} testId="part-x" onChange={(v) => patchPart(sel.part.id, { x: v })} />
              <Num label="Y (od tla)" value={sel.part.y} testId="part-y" onChange={(v) => patchPart(sel.part.id, { y: v })} />
              {sel.shape.type !== 'piece' && <Num label={sel.shape.type === 'sheet' ? 'Širina' : 'Dužina'} value={sel.part.lengthMm} min={1} testId="part-length" onChange={(v) => patchPart(sel.part.id, { lengthMm: v })} />}
              {sel.shape.type === 'sheet' && <Num label="Visina" value={sel.part.heightMm ?? 0} min={1} testId="part-height" onChange={(v) => patchPart(sel.part.id, { heightMm: v })} />}
              {sel.shape.type !== 'sheet' && <Num label="Ugao" unit="°" value={sel.part.angleDeg} min={-360} max={360} testId="part-angle" onChange={(v) => patchPart(sel.part.id, { angleDeg: v })} />}
              {sel.shape.type === 'linear' && isSymmetricRect(sel.shape.section) && (() => {
                // pravougaona cev ili traka: bira se čeona strana (koja stranica preseka je okrenuta ka posmatraču), ne ugao
                const e = sectionFace(sel.shape.section, 0);
                const first = sel.part.rot % 180 === 0;
                const pick = (r: number) => (isFramePart(sel.part) ? rotateFrame(r) : patchPart(sel.part.id, { rot: r }));
                return <FaceChoice testPrefix="part" a={e.u1 - e.u0} b={e.v1 - e.v0} firstPressed={first} onPick={pick} />;
              })()}
              {sel.shape.type === 'linear' && !isSymmetricRect(sel.shape.section) && (
                <div className="grid gap-1 py-1 text-[13px]">
                  <span className="text-slate-600">Okretanje preseka</span>
                  <span className="grid grid-cols-4 rounded-lg border border-line overflow-hidden">
                    {[0, 90, 180, 270].map((r) => <button key={r} data-testid={`part-rot-${r}`} aria-pressed={sel.part.rot === r} className={`py-1 text-[12px] font-semibold ${sel.part.rot === r ? 'bg-brand-black text-white' : 'hover:bg-slate-50'}`} onClick={() => (isFramePart(sel.part) ? rotateFrame(r) : patchPart(sel.part.id, { rot: r }))}>{r}°</button>)}
                  </span>
                </div>
              )}
              {sel.shape.type === 'linear' && (
                <Num label="Nagib preseka (koso)" unit="°" value={sel.part.tiltDeg ?? 0} min={-90} max={90} testId="part-tilt" onChange={(v) => patchPart(sel.part.id, { tiltDeg: v || undefined })} />
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
                    <tr><td className="text-slate-600 py-0.5">Trenutni nagib</td><td className="text-right font-medium tabular-nums" data-testid="guide-tilt">{fmtDeg(sel.part.tiltDeg ?? 0)}°</td></tr>
                    <tr><td className="text-slate-600 py-0.5">Visina prečke spreda</td><td className="text-right font-medium tabular-nums">{fmtDeg(sectionFace(report.section, sel.part.rot + (sel.part.tiltDeg ?? 0)).face)} mm</td></tr>
                    <tr><td className="text-slate-600 py-0.5">Ulazi u kanal (levo / desno)</td><td className="text-right font-medium tabular-nums" data-testid="guide-insert">{fmtDeg(report.L.mouthX - sel.part.x)} / {fmtDeg(sel.part.x + sel.part.lengthMm - report.R.mouthX)} mm</td></tr>
                  </tbody></table>
                  <Num label="Tolerancija u kanalu" value={model.barClearance ?? 0} min={0} max={20} testId="guide-clearance" onChange={(v) => change((m) => ({ ...m, barClearance: v || undefined }))} />
                  <p className="text-[11.5px] text-muted -mt-0.5">Zazor prečke u otvoru U profila (npr. 1 mm za lakiranje). Ugao uklapanja se računa za otvor umanjen za toleranciju; ako se promeni, postojeći nagibi se ograničavaju na novi ugao.</p>
                  <button className="btn btn-sm btn-primary w-full mt-2" data-testid="guide-set-fit" onClick={() => patchPart(sel.part.id, { tiltDeg: -report.fit.minus })}>Postavi pod uglom uklapanja</button>
                  <p className="text-[11.5px] text-muted mt-1.5">Prečka ne može da izađe van U profila: dužina, položaj, dubina i nagib se ograničavaju na kanal.</p>
                </div>
              )}
              {barGroup(model, sel.part, materials) && <BarLayoutBox key={sel.part.id} model={model} bar={sel.part} materials={materials} onApply={(m) => change(() => m)} onError={setNotice} />}
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
      {pendingSwap && (() => {
        const role = pendingSwap.ids.some((x) => replaceRole(model, x) === 'guide') ? 'guide' : replaceRole(model, pendingSwap.ids[0]);
        const n = swapTargets(pendingSwap.ids).length;
        const to = materials.find((m) => m.id === pendingSwap.materialId);
        return (
          <ConfirmDialog title="Zameni materijal" confirmLabel={role === 'guide' ? 'Zameni oba U profila' : `Zameni svih ${n} prečki`}
            message={role === 'guide'
              ? <><p>Bočni U profili idu u paru: ograda se ne može napraviti sa različitim U profilima levo i desno. Zato se zamenjuje i U profil na suprotnoj strani, oba novim materijalom <b>{to?.name}</b>.</p><p className="mt-2 text-[13px] text-muted">Prečke se same prilagođavaju: ulaze do dna novog kanala, ugao uklapanja i razmak se računaju iznova, a broj prečki i odstojanja od vrha i dna ostaju. Ako prečke ne staju, ništa se ne menja.</p></>
              : <><p>Prečke iste vrste između istih U profila moraju biti od istog materijala. Zamenjuje se svih {n} prečki novim materijalom <b>{to?.name}</b>.</p><p className="mt-2 text-[13px] text-muted">Ugao, dužina i razmak se prilagođavaju novom preseku. Ako prečke ne staju, ništa se ne menja.</p></>}
            onConfirm={() => { const sw = pendingSwap; setPendingSwap(null); swapMaterial(sw.ids, sw.materialId); }}
            onCancel={() => setPendingSwap(null)} />
        );
      })()}
    </div>
  );
}
