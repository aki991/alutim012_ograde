import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { visibleMaterials } from '../../config/features';
import { MaterialPicker } from '../designer/MaterialPicker';
import {
  POS_LABELS, resolveSliding, slidingBom, variantTitle,
  type CheckLevel, type PosKey, type SlidingActuation, type SlidingBomItem, type SlidingResult, type SlidingSpec, type SlidingSupport,
} from '../../domain/gates/slidingAssembly';
import { dimDefault, dimOf, isPartOn, MATERIAL_TO_DIMS, partsFor, PART_GROUP_LABELS, type DimDef, type PartDef, type PartGroup } from '../../domain/gates/slidingParts';
import { BRACE_LABELS, type BraceKind, type TailBrace } from '../../domain/gates/slidingTail';
import { materialDimFields, materialShape, sectionFace } from '../../domain/models/materialShape';
import type { Material } from '../../domain/models/types';
import { useAppStore } from '../../store/useAppStore';
import { uid } from '../../utils/id';
import { NumInput } from '../forms/NumInput';

const fmt = (n: number) => `${Math.round(n).toLocaleString('sr-RS')} mm`;
const LEVEL_TONE: Record<CheckLevel, string> = { ok: 'text-emerald-700', warn: 'text-amber-800', error: 'text-[#b42318]', pending: 'text-slate-600' };
const LEVEL_ICON = { ok: CheckCircle2, warn: AlertTriangle, error: AlertTriangle, pending: Clock } as const;
const HW_CATEGORIES = ['okov', 'automatika', 'ostalo', 'stub'];

function Seg<T extends string>({ value, options, onChange, testId }: { value: T; options: [T, string][]; onChange: (v: T) => void; testId: string }) {
  return (
    <span className="grid rounded-lg border border-line overflow-hidden" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} data-testid={testId}>
      {options.map(([v, l]) => (
        <button key={v} type="button" data-testid={`${testId}-${v}`} aria-pressed={value === v} className={`py-1.5 text-[12.5px] font-semibold ${value === v ? 'bg-brand-black text-white' : 'bg-white hover:bg-slate-50'}`} onClick={() => onChange(v)}>{l}</button>
      ))}
    </span>
  );
}

export interface SlidingFormProps {
  /** umesto polja „Naziv varijante“ (u projektu: izbor modela kapije) */
  nameSlot?: React.ReactNode;
  spec: SlidingSpec;
  /** svetla širina rama (spoljna širina krila) i visina kapije od tla */
  W: number;
  H: number;
  opening: 'left' | 'right';
  onSpec: (patch: Partial<SlidingSpec>, key?: string) => void;
  onWidth: (outer: number) => void;
  onHeight: (frameHeight: number) => void;
  onFrameBottom: (v: number) => void;
  onOpening: (v: 'left' | 'right') => void;
  /** ključ probe hoda u stanju editora */
  slideId: string;
  /** deo (ključ iz slidingParts) koji je izabran na crtežu */
  selectedPart?: string | null;
  onSelectPart?: (key: string | null) => void;
}

/**
 * Sva podešavanja klizne kapije na jednom mestu: mere, proba hoda, provere, svaki deo sa svojim merama, pozicijom, materijalom i brojem
 * komada, i sastavnica. Koristi se u panelu kapije u projektu i u crtežu modela („Doradi“).
 */
export function SlidingForm({ nameSlot, spec, W, H, opening, onSpec, onWidth, onHeight, onFrameBottom, onOpening, slideId, selectedPart, onSelectPart }: SlidingFormProps) {
  const st = useAppStore.getState();
  const materials = useAppStore((s) => s.materials);
  const pct = useAppStore((s) => s.editor.slideTest[slideId] ?? 0);
  const res = useMemo(() => resolveSliding(spec, W, H), [spec, W, H]);
  const bom = useMemo(() => slidingBom(res), [res]);
  const fh = res.frameHeight;
  const cant = spec.support === 'cantilever';
  const [open, setOpen] = useState<Set<string>>(new Set());
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  // klik na deo na crtežu otvara njegovu karticu
  useEffect(() => {
    if (!selectedPart) return;
    setOpen((o) => (o.has(selectedPart) ? o : new Set(o).add(selectedPart)));
    refs.current[selectedPart]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedPart]);

  const issues = (field: string) => res.checks.filter((c) => c.field === field && c.level !== 'ok' && c.level !== 'pending');
  const fieldNote = (field: string) => issues(field).map((c) => <div key={c.key} className={`text-[11.5px] ${LEVEL_TONE[c.level]}`} data-testid={`sl-issue-${field}`}>{c.msg}</div>);
  const round = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

  const mainRow = (label: string, field: string, value: number | null, onCommit: (v: number | null) => void, opts: { allowEmpty?: boolean; hint?: string } = {}) => (
    <div className="py-1" key={field}>
      <div className="grid grid-cols-[minmax(0,1fr)_110px_24px] gap-2 items-center">
        <span className="text-[13px] leading-tight">{label}{opts.hint && <span className="block text-[11px] text-muted">{opts.hint}</span>}</span>
        <NumInput value={value} testId={`sl-${field}`} ariaLabel={label} placeholder={opts.allowEmpty ? 'nije izmereno' : '—'}
          onCommit={(v) => { if (v === null && !opts.allowEmpty) return; onCommit(round(v)); }} />
        <span className="text-[11px] text-muted">mm</span>
      </div>
      {fieldNote(field)}
    </div>
  );

  // krilo iz modela: ram, U-profili i prečke se podešavaju u modelu (izbor modela ili crtanje), ovde samo klizni okov
  const parts = partsFor(spec.support, spec.actuation).filter((p) => !(p.leaf && spec.drawnLeaf));
  const groups: PartGroup[] = ['ram', 'oslonac', 'vodjenje', 'pogon'];

  const partCard = (p: PartDef) => {
    const isOpen = open.has(p.key);
    const items = p.bom.map((k) => bom.find((b) => b.key === k)).filter((b): b is SlidingBomItem => !!b);
    const undefinedCount = items.filter((b) => !b.materialText && (!b.materialId || !materials.some((m) => m.id === b.materialId))).length;
    const hasIssue = [...p.dims.map((d) => d.key), ...(p.pos ?? [])].some((k) => issues(k).length > 0);
    const placed = isPartOn(spec, p.key);
    return (
      <div key={p.key} ref={(el) => { refs.current[p.key] = el; }} className={`rounded-lg border ${selectedPart === p.key ? 'border-brand-red' : 'border-line'} ${placed ? '' : 'opacity-70'}`} data-testid={`sl-part-${p.key}`}>
        <button type="button" className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left text-[13px] font-semibold" aria-expanded={isOpen} data-testid={`sl-part-toggle-${p.key}`}
          onClick={() => { setOpen((o) => { const n = new Set(o); if (n.has(p.key)) n.delete(p.key); else n.add(p.key); return n; }); onSelectPart?.(isOpen ? null : p.key); }}>
          {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <span className="flex-1">{p.label}</span>
          {!placed && <span className="text-[11px] font-normal text-muted">nije postavljen</span>}
          {placed && hasIssue && <AlertTriangle size={14} className="text-amber-700" />}
          {placed && undefinedCount > 0 && items.length > 0 && <span className="text-[11px] font-normal text-amber-800" data-testid={`sl-part-undef-${p.key}`}>nije definisano{items.length > 1 ? ` (${undefinedCount})` : ''}</span>}
        </button>
        {isOpen && <div className="px-2.5 pb-2.5"><SlidingPartBody part={p} spec={spec} res={res} bom={bom} onSpec={onSpec} onFrameBottom={onFrameBottom} slideId={slideId} /></div>}
      </div>
    );
  };

  return (
    <div className="space-y-2" data-testid="sliding-form">
      <div className="rounded-lg bg-slate-50 border border-line px-3 py-2 text-[12.5px]">
        <div className="font-semibold" data-testid="sl-variant">{variantTitle(spec)}</div>
        <div className="text-muted">{spec.confirmed ? 'Mere potvrđene na terenu.' : 'Radni nacrt: ilustrativna geometrija — svetli otvor, okov, graničnike i montažne mere potvrditi za stvarni posao.'}</div>
      </div>
      {nameSlot ?? (
        <label className="flex flex-col gap-1 text-[13px]">Naziv varijante
          <input className="input !py-1" data-testid="sl-name" value={spec.name} onChange={(e) => onSpec({ name: e.target.value }, 'name')} />
        </label>
      )}
      <div className="grid gap-1 text-[13px]"><span>Oslonac</span>
        <Seg<SlidingSupport> testId="sl-support" value={spec.support} options={[['ground_rail', 'Na donjoj šini'], ['cantilever', 'Samonoseća']]} onChange={(v) => onSpec({ support: v })} />
      </div>
      <div className="grid gap-1 text-[13px]"><span>Pogon</span>
        <Seg<SlidingActuation> testId="sl-actuation" value={spec.actuation} options={[['manual', 'Ručna'], ['motor', 'Motorna']]} onChange={(v) => onSpec({ actuation: v })} />
      </div>
      <div className="grid gap-1 text-[13px]"><span>Smer otvaranja (gledano sa ulice)</span>
        <Seg<'left' | 'right'> testId="sl-opening" value={opening} options={[['left', 'Ulevo'], ['right', 'Udesno']]} onChange={onOpening} />
      </div>

      <div className="pt-1" data-testid="sl-main">
        <div className="text-[12px] font-bold uppercase text-muted">Mere</div>
        {mainRow('Spoljna širina rama', 'width', Math.round(W), (v) => { if (v !== null && v >= 300) onWidth(v); })}
        {mainRow('Spoljna visina rama', 'height', Math.round(fh), (v) => { if (v !== null && v >= 300) onHeight(v); }, { hint: `vrh rama ${fmt(H)} od tla` })}
        {mainRow('Hod', 'travel', res.spec.travel, (v) => onSpec(v === null ? { travelSet: false } : { travel: v, travelSet: true }, 'travel'), { allowEmpty: true, hint: spec.travelSet ? 'zadato ručno; obrišite polje da hod prati širinu rama' : 'prati širinu rama (na šini − 100 mm, samonoseća − 70 mm)' })}
        {mainRow('Svetli otvor (izmereno)', 'clearOpening', spec.clearOpening, (v) => onSpec({ clearOpening: v }, 'clear'), { allowEmpty: true, hint: 'između prepreka; prazno = nije izmereno' })}
        {mainRow('Slobodan prostor na strani otvaranja', 'sideSpace', spec.sideSpace, (v) => onSpec({ sideSpace: v }, 'side'), { allowEmpty: true, hint: 'od kraja prolaza do prepreke' })}
        {mainRow('Rezerva za provere', 'reserve', spec.reserve, (v) => onSpec({ reserve: v ?? 0 }), { hint: 'točkići na šini, kolica u C-profilu, zupčanik na letvi' })}
      </div>

      <div className="rounded-lg border border-line p-2" data-testid="sl-travel-test">
        <div className="flex items-center justify-between text-[13px]"><b>Proba hoda</b><span className="tabular-nums" data-testid="sl-pct">{pct} % · {fmt((res.spec.travel * pct) / 100)}</span></div>
        <input type="range" min={0} max={100} step={1} value={pct} className="w-full" aria-label="Proba hoda" data-testid="sl-slider" onChange={(e) => st.setSlideTest(slideId, Number(e.target.value))} />
        <div className="flex gap-1.5">
          <button className="btn btn-sm flex-1" data-testid="sl-closed" onClick={() => st.setSlideTest(slideId, 0)}>Zatvoreno</button>
          <button className="btn btn-sm flex-1" data-testid="sl-half" onClick={() => st.setSlideTest(slideId, 50)}>50 %</button>
          <button className="btn btn-sm flex-1" data-testid="sl-open" onClick={() => st.setSlideTest(slideId, 100)}>Otvoreno</button>
        </div>
        <label className="flex items-center gap-2 text-[12.5px] mt-1.5"><input type="checkbox" checked={spec.showOpenOutline} data-testid="sl-outline" onChange={(e) => onSpec({ showOpenOutline: e.target.checked })} />Isprekidan otvoren položaj</label>
        <p className="text-[11.5px] text-muted mt-1">Proba pomera samo pokretne delove; prihvat, vođica, {cant ? 'kolica' : 'šina'}, graničnik i motor stoje. Prikaz nije radionička mera.</p>
      </div>

      <div className="space-y-1" data-testid="sl-checks">
        <div className="text-[12px] font-bold uppercase text-muted">Provere</div>
        {res.checks.map((c) => { const I = LEVEL_ICON[c.level]; return (
          <div key={c.key} className={`flex gap-1.5 text-[12.5px] ${LEVEL_TONE[c.level]}`} data-testid={`sl-check-${c.key}`} data-level={c.level}>
            <I size={14} className="shrink-0 mt-0.5" />
            <span><b>{c.title}:</b> {c.msg}{c.basis && <span className="block text-[11px] text-muted">Proverava se: {c.basis}</span>}</span>
          </div>
        ); })}
      </div>

      <div className="space-y-2.5 pt-1" data-testid="sl-parts">
        <div className="flex items-center justify-between">
          <div className="text-[12px] font-bold uppercase text-muted">Delovi kapije</div>
          <span className="flex gap-1">
            <button className="btn btn-sm" data-testid="sl-parts-open" onClick={() => setOpen(new Set(parts.map((p) => p.key)))}>Otvori sve</button>
            <button className="btn btn-sm" data-testid="sl-parts-close" onClick={() => setOpen(new Set())}>Zatvori sve</button>
          </span>
        </div>
        {groups.map((g) => {
          const list = parts.filter((p) => p.group === g);
          if (!list.length) return null;
          return (
            <section key={g} className="space-y-1.5">
              <div className="text-[12px] font-semibold text-slate-600">{PART_GROUP_LABELS[g]}</div>
              {list.map(partCard)}
            </section>
          );
        })}
      </div>

      <details className="rounded-lg border border-line p-2" data-testid="sl-bom">
        <summary className="cursor-pointer text-[13px] font-semibold">Sastavnica kapije ({bom.length} stavki)</summary>
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px] mt-1">
            <thead className="text-muted text-left"><tr><th className="py-0.5 pr-1">Stavka</th><th className="pr-1 text-right">Kol.</th><th className="pr-1 text-right">Prikazana</th><th className="pr-1 text-right">Krojna</th><th className="text-right">Nabavna</th></tr></thead>
            <tbody>
              {bom.map((b) => {
                const mat = b.materialId ? materials.find((m) => m.id === b.materialId) : undefined;
                return (
                  <tr key={b.key} className="border-t border-line align-top" data-testid={`sl-bom-${b.key}`}>
                    <td className="py-0.5 pr-1">{b.name}<span className="block text-muted">{mat ? mat.name : b.materialText ? `${b.materialText} (ručno)` : <span className="text-amber-800">nije definisano</span>} · {b.make}{b.kit ? ' · deo kompleta motora' : ''}{b.confirm ? ' · potvrditi' : ''}{b.note ? ` · ${b.note}` : ''}</span></td>
                    <td className="pr-1 text-right whitespace-nowrap">{b.qty} {b.unit}</td>
                    <td className="pr-1 text-right">{b.shownMm ?? '—'}</td>
                    <td className="pr-1 text-right w-[74px]">{b.make === 'izrada' || b.key === 'rail' || b.key === 'carrier'
                      ? <NumInput value={b.cutMm} testId={`sl-cut-${b.key}`} placeholder="potvrditi" ariaLabel={`Krojna mera: ${b.name}`} onCommit={(v) => { const c = { ...spec.cuts }; if (v === null) delete c[b.key]; else c[b.key] = Math.round(v); onSpec({ cuts: c }); }} />
                      : '—'}</td>
                    <td className="text-right">{b.buyMm ?? (b.make === 'kupovina' && b.unit === 'kom' && b.shownMm ? 'po dobavljaču' : '—')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted mt-1">Krojna mera bez upisa čeka potvrdu (zavisi od spoja ili dubine ulaska u kanal) i ne ulazi u krojnu listu dok se ne upiše.</p>
      </details>

      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={spec.confirmed} data-testid="sl-confirmed" onChange={(e) => onSpec({ confirmed: e.target.checked })} />Mere potvrđene na terenu</label>
    </div>
  );
}

const isProfile = (b: SlidingBomItem): boolean => b.make === 'izrada' || b.key === 'rail' || b.key === 'carrier';

/** mere preseka cevi: čeona strana (širina u pogledu spreda) i dubina (ka posmatraču) kad je presek neokrenut */
interface FD { face: number; depth: number }
const r1 = (n: number): number => Math.round(n * 10) / 10;
const fdOfText = (text: string): FD => {
  const sh = materialShape({ sku: '', name: text, unit: 'm', category: 'profil' });
  if (sh.type !== 'linear' || !sh.exact) return { face: 0, depth: 0 };
  const e = sectionFace(sh.section, 0);
  return { face: r1(e.face), depth: r1(e.depth) };
};
const faceOfText = (text: string): number => fdOfText(text).face;
const fdOfMaterial = (m: Material): FD => { const sh = materialShape(m); if (sh.type !== 'linear') return { face: 0, depth: 0 }; const e = sectionFace(sh.section, 0); return { face: r1(e.face), depth: r1(e.depth) }; };

/** izabran profil stavke (iz cenovnika ili upisan ručno) */
const profileFD = (spec: SlidingSpec, materials: Material[], key: string): FD | null => {
  const id = spec.partMat?.[key];
  const m = id ? materials.find((x) => x.id === id) : undefined;
  if (m) { const f = fdOfMaterial(m); return f.face > 0 ? f : null; }
  const t = spec.partText?.[key];
  if (t) { const f = fdOfText(t); return f.face > 0 ? f : null; }
  return null;
};
/** vidljiva širina i dubina cevi posle okretanja preseka (90 = čeona strana je kraća stranica) */
const visibleFD = (fd: FD, rot: number | undefined): { w: number; d: number } => (rot === 90 ? { w: fd.depth, d: fd.face } : { w: fd.face, d: fd.depth });

/** gde se čuvaju vidljiva širina i dubina profila u sklopu (ključ stavke → ključevi mera) */
const PROFILE_DIMS: Record<string, { w: string; d?: string }> = {
  carrier: { w: 'carrier.h', d: 'carrier.d' }, 'tail-diag': { w: 'tail.diag.w', d: 'tail.diag.d' }, 'tail-bottom': { w: 'tail.bottom.w', d: 'tail.bottom.d' },
};

/** okretanje preseka: čeona strana cevi se menja, pa se menja i širina na crtežu, dužine i uglovi sečenja */
function rotatePatch(spec: SlidingSpec, materials: Material[], key: string, rot: number): { patch: Partial<SlidingSpec>; w: number } {
  const pr = { ...(spec.partRot ?? {}), [key]: rot };
  const dims = { ...(spec.dims ?? {}) };
  const fd = profileFD(spec, materials, key);
  const v = fd ? visibleFD(fd, rot) : { w: 0, d: 0 };
  const dk = PROFILE_DIMS[key];
  if (dk) { if (v.w > 0) dims[dk.w] = v.w; else delete dims[dk.w]; if (dk.d) { if (v.d > 0) dims[dk.d] = v.d; else delete dims[dk.d]; } }
  return { patch: { partRot: pr, dims }, w: v.w };
}

/** podaci za izbor čeone strane: samo za pravougaone preseke (kvadratna cev nema šta da se okreće) */
function orientFor(spec: SlidingSpec, materials: Material[], key: string): { face: number; depth: number; rot: number } | undefined {
  const fd = profileFD(spec, materials, key);
  if (!fd || Math.abs(fd.face - fd.depth) < 0.05) return undefined;
  return { ...fd, rot: spec.partRot?.[key] === 90 ? 90 : 0 };
}

/** izbor za stavku sastavnice: materijal iz cenovnika ili ručno upisan naziv (npr. „C profil 60×60×2“); prazno = nije definisano */
interface Choice { materialId?: string; text?: string }

/** izbor → izmene spec-a; vidljiva širina i dubina profila (uz izabranu čeonu stranu) idu u mere sklopa, a širina se vraća i kao `w` */
function choicePatch(spec: SlidingSpec, materials: Material[], key: string, c: Choice): { patch: Partial<SlidingSpec>; w: number } {
  const pm = { ...(spec.partMat ?? {}) }; const pt = { ...(spec.partText ?? {}) }; const dims = { ...(spec.dims ?? {}) };
  let w = 0;
  const text = c.text?.trim();
  if (c.materialId) {
    const m = materials.find((x) => x.id === c.materialId); pm[key] = c.materialId; delete pt[key];
    // izabrana kolica (ili drugi okov sa merama) prenose svoje mere u sklop
    const map = MATERIAL_TO_DIMS[key];
    if (m && map) for (const f of materialDimFields(m)) { const sk = map[f.key]; if (sk && f.value > 0) dims[sk] = f.value; }
  }
  else if (text) { delete pm[key]; pt[key] = text; }
  else { delete pm[key]; delete pt[key]; }
  const next = { ...spec, partMat: pm, partText: pt };
  const fd = profileFD(next, materials, key);
  const v = fd ? visibleFD(fd, spec.partRot?.[key]) : { w: 0, d: 0 };
  w = v.w;
  const dk = PROFILE_DIMS[key];
  if (dk) { if (v.w > 0) dims[dk.w] = v.w; else delete dims[dk.w]; if (dk.d) { if (v.d > 0) dims[dk.d] = v.d; else delete dims[dk.d]; } }
  return { patch: { partMat: pm, partText: pt, dims }, w };
}

/**
 * Izbor materijala za deo: lista iz cenovnika (grupe, mere od najmanje do najveće, pretraga) ili ručno upisan naziv koji ide u krojnu
 * listu i radni nalog. Upisan naziv može dugmetom da se doda u „Materijali i cene“, pa se posle bira iz liste. Bez izbora: „nije definisano“.
 */
function MaterialField({ label, kind, materialId, text, materials, testId, onChange, orient }: {
  label: string; kind: 'profile' | 'hardware'; materialId?: string; text?: string; materials: Material[]; testId: string; onChange: (c: Choice) => void;
  /** pravougaona cev: čeona strana (okrenuta ka posmatraču); 90 = kraća stranica preseka */
  orient?: { face: number; depth: number; rot: number; onRot: (rot: number) => void };
}) {
  const options = visibleMaterials(materials, materialId ? [materialId] : []).filter((m) => (kind === 'profile' ? materialShape(m).type === 'linear' : HW_CATEGORIES.includes(m.category)));
  const chosen = materialId ? materials.find((m) => m.id === materialId) : undefined;
  const [draft, setDraft] = useState(text ?? '');
  useEffect(() => { setDraft(text ?? ''); }, [text]);
  const commit = () => { if (draft.trim() !== (text ?? '')) onChange({ text: draft }); };
  const addToPrice = () => {
    const name = draft.trim();
    if (!name) return;
    const existing = materials.find((m) => m.name.trim().toLowerCase() === name.toLowerCase());
    const profile = kind === 'profile';
    const mat: Material = existing ?? { id: uid(profile ? 'mat_prof' : 'mat_okov'), sku: `${profile ? 'PROF' : 'OKOV'}-${uid('').slice(-5).toUpperCase()}`, name, category: profile ? 'profil' : 'okov', unit: profile ? 'm' : 'kom', unitPrice: 0, wastePercent: 0, demo: false };
    if (!existing) useAppStore.getState().upsertMaterial(mat);
    onChange({ materialId: mat.id });
  };
  const face0 = chosen ? faceOf(chosen) : text ? faceOfText(text) : 0;
  const face = orient ? (orient.rot === 90 ? orient.depth : orient.face) : face0;
  return (
    <div className="space-y-1" data-testid={`${testId}-field`}>
      <div className="text-[12.5px] leading-tight">{label}{kind === 'profile' && face > 0 && <span className="text-[11px] text-muted"> · širina u pogledu {face} mm</span>}</div>
      <div className="flex gap-1.5 items-center">
        <div className="flex-1 min-w-0"><MaterialPicker materials={options} placeholder={chosen ? chosen.name : text ? '— ručno upisano —' : '— izaberite iz cenovnika —'} testId={testId} ariaLabel={label} onPick={(id) => onChange({ materialId: id })} /></div>
        {(chosen || text) && <button className="btn btn-icon !w-8 !h-8 shrink-0" aria-label={`Obriši izbor: ${label}`} data-testid={`${testId}-clear`} onClick={() => onChange({})}><X size={14} /></button>}
      </div>
      <div className="flex gap-1.5 items-center">
        <input className="input !py-1 flex-1 min-w-0" placeholder={kind === 'profile' ? 'ili upišite ručno, npr. C profil 60×60×2' : 'ili upišite ručno naziv okova'} aria-label={`Ručno upisan naziv: ${label}`} data-testid={`${testId}-text`} value={draft}
          onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} />
        <button className="btn btn-sm shrink-0" disabled={!draft.trim()} title="Upisuje materijal u „Materijali i cene“ i bira ga iz liste" data-testid={`${testId}-add`} onClick={addToPrice}><Plus size={14} />Dodaj</button>
      </div>
      {orient && (
        <div className="space-y-1" data-testid={`${testId}-orient`}>
          <div className="text-[11.5px] text-slate-600">Čeona strana cevi {orient.face}×{orient.depth} (okrenuta ka posmatraču)</div>
          <span className="grid grid-cols-2 rounded-lg border border-line overflow-hidden">
            {([[0, orient.face], [90, orient.depth]] as [number, number][]).map(([r, v]) => (
              <button key={r} type="button" aria-pressed={orient.rot === r} data-testid={`${testId}-orient-${r}`} className={`py-1 text-[12.5px] font-semibold ${orient.rot === r ? 'bg-brand-black text-white' : 'bg-white hover:bg-slate-50'}`} onClick={() => orient.onRot(r)}>čeona strana {v} mm</button>
            ))}
          </span>
          <p className="text-[11px] text-muted">Menja širinu cevi na crtežu, dužine i uglove sečenja u krojnoj listi.</p>
        </div>
      )}
      {text && !chosen && <p className="text-[11px] text-muted" data-testid={`${testId}-manual`}>Upisano ručno: ide u krojnu listu i radni nalog. Nije u cenovniku — „Dodaj“ ga upisuje u „Materijali i cene“.</p>}
      {chosen && chosen.unitPrice === 0 && <p className="text-[11px] text-amber-800">Cena nije upisana: upišite je u „Materijali i cene“.</p>}
    </div>
  );
}

/** red stavke sastavnice u kartici dela: broj komada i okov iz cenovnika ili ručno upisan; bez izbora piše „nije definisano“ */
function MaterialRow({ item, spec, materials, onSpec }: { item: SlidingBomItem; spec: SlidingSpec; materials: Material[]; onSpec: (p: Partial<SlidingSpec>) => void }) {
  const profile = isProfile(item);
  return (
    <div data-testid={`sl-matrow-${item.key}`} className="space-y-1">
      <div className="flex items-center gap-2 text-[12.5px]">
        <span className="flex-1 leading-tight font-semibold">{item.name}{item.confirm && <span className="text-[11px] font-normal text-muted"> · potvrditi</span>}</span>
        {!profile && item.key !== 'rackMounts' && (
          <label className="flex items-center gap-1 text-[11.5px] text-muted">kom<span className="w-[56px]"><NumInput value={item.qty} testId={`sl-qty-${item.key}`} ariaLabel={`Broj komada: ${item.name}`} onCommit={(v) => { const q = { ...(spec.qtys ?? {}) }; if (v === null) delete q[item.key]; else q[item.key] = Math.max(0, Math.round(v)); onSpec({ qtys: q }); }} /></span></label>
        )}
      </div>
      <MaterialField label="Okov" kind="hardware" materialId={item.materialId} text={item.materialText} materials={materials} testId={`sl-mat-${item.key}`} onChange={(c) => onSpec(choicePatch(spec, materials, item.key, c).patch)} />
    </div>
  );
}

/** Postavlja ili skida deo okova sa kapije (spisak postavljenih delova se pravi od trenutnog stanja kad ga još nema). */
export function withPartOn(spec: SlidingSpec, key: string, placed: boolean): Partial<SlidingSpec> {
  const base = spec.enabled ?? Object.fromEntries(partsFor(spec.support, spec.actuation).filter((p) => !p.leaf).map((p) => [p.key, isPartOn(spec, p.key)]));
  return { enabled: { ...base, [key]: placed } };
}

/**
 * Podešavanja jednog dela klizne kapije: postavljen ili ne, mere (veličina), položaj (od početka, razmak, broj), okov ili materijal
 * iz cenovnika i broj komada. Isto u crtanju modela i u panelu kapije u projektu.
 */
export function SlidingPartBody({ part: p, spec, res, bom, onSpec, onFrameBottom, onRemove, slideId }: {
  /** ID kapije (ili modela) čiji se crtež prikazuje: za isticanje jedne cevi repa */
  slideId: string;
  part: PartDef; spec: SlidingSpec; res: SlidingResult; bom: SlidingBomItem[];
  onSpec: (patch: Partial<SlidingSpec>, key?: string) => void; onFrameBottom?: (v: number) => void;
  /** dugme „Ukloni sa kapije“ (crtanje modela); bez njega je prekidač „Postavljen na kapiju“ */
  onRemove?: () => void;
}) {
  const materials = useAppStore((s) => s.materials);
  const fh = res.frameHeight; const W = res.W;
  const placed = isPartOn(spec, p.key);
  const items = p.bom.map((k) => bom.find((b) => b.key === k)).filter((b): b is SlidingBomItem => !!b);
  const issues = (field: string) => res.checks.filter((c) => c.field === field && c.level !== 'ok' && c.level !== 'pending');
  const fieldNote = (field: string) => issues(field).map((c) => <div key={c.key} className={`text-[11.5px] ${LEVEL_TONE[c.level]}`} data-testid={`sl-issue-${field}`}>{c.msg}</div>);
  const setDim = (d: DimDef, v: number | null) => {
    if (d.field) {
      if (v === null) return;
      if (d.field === 'frameBottomY') { if (onFrameBottom) onFrameBottom(v); else onSpec({ frameBottomY: v }); return; }
      onSpec({ [d.field]: d.field === 'infillCount' ? Math.max(1, Math.round(v)) : v } as Partial<SlidingSpec>);
      return;
    }
    const dims = { ...(spec.dims ?? {}) };
    if (v === null) delete dims[d.key]; else dims[d.key] = d.unit === 'kom' ? Math.max(1, Math.round(v)) : v;
    onSpec({ dims });
  };
  return (
    <div className="space-y-1.5" data-testid={`sl-partbody-${p.key}`}>
      {p.note && <p className="text-[11.5px] text-muted">{p.note}</p>}
      {!p.leaf && !onRemove && (
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" data-testid={`sl-on-${p.key}`} checked={placed} onChange={(e) => onSpec(withPartOn(spec, p.key, e.target.checked))} />Postavljen na kapiju</label>
      )}
      {placed && p.key !== 'tail' && items.some(isProfile) && (
        <div className="space-y-1.5" data-testid={`sl-part-profiles-${p.key}`}>
          {/* mera dela koja dolazi iz profila (npr. visina C-profila = širina izabranog profila u pogledu) */}
          {items.filter(isProfile).map((b) => <MaterialField key={b.key} label={b.name} kind="profile" materialId={b.materialId} text={b.materialText} materials={materials} testId={`sl-profile-${b.key}`}
            orient={(() => { const o = orientFor(spec, materials, b.key); return o ? { ...o, onRot: (r: number) => onSpec(rotatePatch(spec, materials, b.key, r).patch) } : undefined; })()}
            onChange={(c) => onSpec(choicePatch(spec, materials, b.key, c).patch)} />)}
        </div>
      )}
      {placed && p.dims.filter((d) => !d.hidden).map((d) => {
        const v = dimOf(spec, d.key, fh, W);
        const def = dimDefault(spec, d, fh, W);
        const manual = !d.field && typeof spec.dims?.[d.key] === 'number';
        return (
          <div key={d.key}>
            <div className="grid grid-cols-[minmax(0,1fr)_96px_28px] gap-2 items-center">
              <span className="text-[12.5px] leading-tight">{d.label}
                <span className={`block text-[11px] ${manual ? 'text-violet-700' : 'text-muted'}`}>{manual ? `ručno · polazno ${def === null ? 'auto' : d.unit === 'kom' ? def : fmt(def)}` : d.field ? '' : def === null ? (d.hint ?? 'auto') : 'polazno'}</span>
              </span>
              <NumInput value={v === null ? null : Math.round(v * 10) / 10} testId={`sl-dim-${d.key}`} ariaLabel={d.label} placeholder={def === null ? 'auto' : '—'}
                onCommit={(x) => { if (x !== null && d.min !== undefined && x < d.min) return; setDim(d, x === null ? null : Math.round(x * 10) / 10); }} />
              <button className="btn btn-icon !w-7 !h-7" title="Vrati polaznu vrednost" aria-label={`Vrati polaznu vrednost: ${d.label}`} data-testid={`sl-dim-reset-${d.key}`} disabled={!manual} onClick={() => setDim(d, null)}><RotateCcw size={13} /></button>
            </div>
            {fieldNote(d.key)}
          </div>
        );
      })}
      {placed && (p.pos ?? []).map((k: PosKey) => {
        const pp = res.pos[k];
        return (
          <div key={k} data-testid={`sl-posrow-${k}`}>
            <div className="grid grid-cols-[minmax(0,1fr)_96px_28px] gap-2 items-center">
              <span className="text-[12.5px] leading-tight">{POS_LABELS[k]}
                <span className={`block text-[11px] ${pp.manual ? 'text-violet-700' : 'text-muted'}`} data-testid={`sl-pos-state-${k}`}>{pp.manual ? `ručno · računski ${fmt(pp.auto)}${Math.abs(pp.value - pp.auto) > 0.5 ? ` (razlika ${pp.value - pp.auto > 0 ? '+' : ''}${Math.round(pp.value - pp.auto)} mm)` : ''}` : 'računski'}</span>
              </span>
              <NumInput value={Math.round(pp.value)} testId={`sl-pos-${k}`} ariaLabel={POS_LABELS[k]} onCommit={(v) => { if (v !== null) onSpec({ manual: { ...spec.manual, [k]: Math.round(v) } }); }} />
              <button className="btn btn-icon !w-7 !h-7" title="Vrati računsku vrednost" aria-label={`Vrati računsku vrednost: ${POS_LABELS[k]}`} data-testid={`sl-pos-reset-${k}`} disabled={!pp.manual}
                onClick={() => { const m = { ...spec.manual }; delete m[k]; onSpec({ manual: m }); }}><RotateCcw size={13} /></button>
            </div>
            {fieldNote(k)}{fieldNote(`pos-${k}`)}
          </div>
        );
      })}
      {placed && p.key === 'tail' && <TailEditor spec={spec} res={res} onSpec={onSpec} slideId={slideId} />}
      {placed && items.some((b) => !isProfile(b)) && (
        <div className="rounded-md bg-slate-50 p-2 space-y-2" data-testid={`sl-part-bom-${p.key}`}>
          <div className="text-[11px] font-bold uppercase text-muted">Okov iz cenovnika</div>
          {items.filter((b) => !isProfile(b)).map((b) => <MaterialRow key={b.key} item={b} spec={spec} materials={materials} onSpec={onSpec} />)}
        </div>
      )}
      {onRemove && <button className="btn btn-sm btn-danger" data-testid={`sl-remove-${p.key}`} onClick={onRemove}>Ukloni sa kapije</button>}
    </div>
  );
}

/** širina cevi u pogledu spreda (mm) iz izabranog profila */
const faceOf = (m: Material): number => { const sh = materialShape(m); return sh.type === 'linear' ? Math.round(sectionFace(sh.section, 0).face * 10) / 10 : 0; };

/**
 * Rep samonoseće kapije: profili kosnika i donje pojasnice (padajući meni), ojačanja (bez, ili više njih: uspravno, vodoravno, koso)
 * sa svojim položajem i profilom. Uz svaku cev su dužina i uglovi sečenja, koji idu u krojnu listu.
 */
function TailEditor({ spec, res, onSpec, slideId }: { spec: SlidingSpec; res: SlidingResult; onSpec: (p: Partial<SlidingSpec>) => void; slideId: string }) {
  const materials = useAppStore((s) => s.materials);
  // izabrana cev repa se ističe na crtežu, da se uporedi sa krojnom listom (isti naziv, dužina i uglovi)
  const sel = useAppStore((s) => s.editor.tailSel?.[slideId] ?? null);
  const pick = (key: string) => useAppStore.getState().setTailSel(slideId, sel === key ? null : key);
  const braces: TailBrace[] = spec.braces ?? [{ id: 'b1', kind: 'vertical' }];
  const fh = res.frameHeight; const fb = spec.frameBottomY; const W = res.W;
  const dflt = res.tailDefaults ?? { vertical: Math.round(res.pos.tailBrace.value), horizontal: Math.round(fb + fh * 0.62), diagX1: W, diagX2: Math.round(res.pos.tailBrace.value) };
  const member = (key: string) => res.tail?.find((m) => m.bomKey === key);
  const info = (key: string) => {
    const m = member(key);
    if (!m) return <p className="text-[11.5px] text-amber-800">Cev ne staje na ovom položaju.</p>;
    const d = (n: number) => String(n).replace('.', ',');
    const e = (a: number[]) => (a.length > 1 ? `V ${a.map(d).join('° + ')}` : d(a[0] ?? 90));
    const on = sel === key;
    return (
      <div className={`flex items-start gap-2 rounded-md ${on ? 'ring-2 ring-primary bg-primary-50 p-1.5' : ''}`} data-selected={on ? 'true' : undefined}>
        <p className="text-[11.5px] text-muted flex-1" data-testid={`sl-cutinfo-${key}`}>{on && <b className="text-ink">{m.label} · </b>}čeona strana {m.w} mm · dužina {m.len} mm · rez pod uglom {e(m.ends[0])}° / {e(m.ends[1])}° (90° = ravan rez; V = zasek u dva reza)</p>
        <button className={`btn btn-sm shrink-0 ${on ? 'btn-dark' : ''}`} aria-pressed={on} data-testid={`sl-tail-pick-${key}`} title="Ističe ovu cev na crtežu, da se uporedi sa krojnom listom" onClick={() => pick(key)}>{on ? 'Istaknuto' : 'Istakni'}</button>
      </div>
    );
  };
  const pickMain = (key: 'tail-diag' | 'tail-bottom') => (c: Choice) => onSpec(choicePatch(spec, materials, key, c).patch);
  const rotMain = (key: string) => (r: number) => onSpec(rotatePatch(spec, materials, key, r).patch);
  const orientMain = (key: string) => { const o = orientFor(spec, materials, key); return o ? { ...o, onRot: rotMain(key) } : undefined; };
  const textOfKey = (key: string): string | undefined => spec.partText?.[key];
  const setBraces = (next: TailBrace[]) => onSpec({ braces: next });
  const patchBrace = (id: string, p: Partial<TailBrace>) => setBraces(braces.map((b) => (b.id === id ? { ...b, ...p } : b)));
  // mere ojačanja imaju dozvoljen raspon (zavisi od repa i ostalih ojačanja): veća ili manja vrednost se svodi na granicu uz obaveštenje ispod polja
  const [notes, setNotes] = useState<Record<string, string>>({});
  const rangeOf = (id: string, field: 'pos' | 'pos2') => res.tailRanges?.[id]?.[field];
  const commitPos = (id: string, field: 'pos' | 'pos2', v: number) => {
    const r = rangeOf(id, field);
    let val = Math.round(v); let msg = '';
    if (r && r.max < r.min) msg = 'Ojačanje ne staje na ovom repu.';
    else if (r && val > r.max) { val = r.max; msg = `Vrednost ne može biti veća od ${r.max} mm.`; }
    else if (r && val < r.min) { val = r.min; msg = `Vrednost ne može biti manja od ${r.min} mm.`; }
    setNotes((n) => ({ ...n, [`${id}.${field}`]: msg }));
    patchBrace(id, { [field]: val });
  };
  const rangeNote = (id: string, field: 'pos' | 'pos2', i: number) => {
    const r = rangeOf(id, field); const msg = notes[`${id}.${field}`];
    return (
      <>
        {r && r.max >= r.min && <p className="text-[11px] text-muted -mt-1" data-testid={`sl-brace-range-${i}-${field}`}>dozvoljeno {r.min}–{r.max} mm</p>}
        {msg && <p className="text-[11.5px] font-semibold text-amber-800" role="alert" data-testid={`sl-brace-note-${i}-${field}`}>{msg}</p>}
      </>
    );
  };
  const orientBrace = (b: TailBrace) => {
    const key = `tail-brace-${b.id}`; const o = orientFor(spec, materials, key);
    return o ? { ...o, onRot: (r: number) => { const x = rotatePatch(spec, materials, key, r); onSpec({ ...x.patch, braces: braces.map((y) => (y.id === b.id ? { ...y, w: x.w > 0 ? x.w : undefined } : y)) }); } } : undefined;
  };
  const pickBrace = (b: TailBrace) => (c: Choice) => {
    const r = choicePatch(spec, materials, `tail-brace-${b.id}`, c);
    onSpec({ ...r.patch, braces: braces.map((x) => (x.id === b.id ? { ...x, w: r.w > 0 ? r.w : undefined } : x)) });
  };
  const add = (kind: BraceKind) => setBraces([...braces, { id: uid('br').slice(-6), kind }]);
  const KIND_OPTS: BraceKind[] = ['vertical', 'horizontal', 'diagonal'];
  return (
    <div className="space-y-2" data-testid="sl-tail-editor">
      <MaterialField label="Profil kosnika" kind="profile" materialId={spec.partMat?.['tail-diag']} text={textOfKey('tail-diag')} materials={materials} orient={orientMain('tail-diag')} onChange={pickMain('tail-diag')} testId="sl-profile-tail-diag" />
      {info('tail-diag')}
      <MaterialField label="Profil donje pojasnice" kind="profile" materialId={spec.partMat?.['tail-bottom']} text={textOfKey('tail-bottom')} materials={materials} orient={orientMain('tail-bottom')} onChange={pickMain('tail-bottom')} testId="sl-profile-tail-bottom" />
      {info('tail-bottom')}
      <div className="rounded-md bg-slate-50 p-2 space-y-2" data-testid="sl-braces">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase text-muted flex-1">Ojačanja repa ({braces.length})</span>
          {braces.length > 0 && <button className="btn btn-sm" data-testid="sl-braces-none" onClick={() => setBraces([])}>Bez ojačanja</button>}
        </div>
        {braces.length === 0 && <p className="text-[12px] text-muted" data-testid="sl-braces-empty">Rep je bez ojačanja.</p>}
        {braces.map((b, i) => (
          <div key={b.id} className="rounded-md border border-line bg-white p-2 space-y-1.5" data-testid={`sl-brace-${i}`}>
            <div className="flex items-center gap-2">
              <select className="input !py-1 !w-auto" aria-label="Vrsta ojačanja" data-testid={`sl-brace-kind-${i}`} value={b.kind} onChange={(e) => patchBrace(b.id, { kind: e.target.value as BraceKind, pos: undefined, pos2: undefined })}>
                {KIND_OPTS.map((k) => <option key={k} value={k}>{BRACE_LABELS[k]} ojačanje</option>)}
              </select>
              <span className="flex-1" />
              <button className="btn btn-icon !w-7 !h-7" aria-label="Ukloni ojačanje" data-testid={`sl-brace-remove-${i}`} onClick={() => setBraces(braces.filter((x) => x.id !== b.id))}><Trash2 size={13} /></button>
            </div>
            <MaterialField label="Profil" kind="profile" materialId={spec.partMat?.[`tail-brace-${b.id}`]} text={textOfKey(`tail-brace-${b.id}`)} materials={materials} orient={orientBrace(b)} onChange={pickBrace(b)} testId={`sl-brace-profile-${i}`} />
            {b.kind === 'vertical' && (
              <label className="grid grid-cols-[minmax(0,1fr)_96px] gap-2 items-center text-[12.5px]"><span>Položaj (X od početka krila)</span>
                <NumInput value={Math.round(b.pos ?? dflt.vertical)} testId={`sl-brace-pos-${i}`} ariaLabel="Položaj ojačanja" onCommit={(v) => { if (v !== null) commitPos(b.id, 'pos', v); }} /></label>
            )}
            {b.kind === 'vertical' && rangeNote(b.id, 'pos', i)}
            {b.kind === 'horizontal' && (
              <label className="grid grid-cols-[minmax(0,1fr)_96px] gap-2 items-center text-[12.5px]"><span>Visina od tla</span>
                <NumInput value={Math.round(b.pos ?? dflt.horizontal)} testId={`sl-brace-pos-${i}`} ariaLabel="Visina ojačanja" onCommit={(v) => { if (v !== null) commitPos(b.id, 'pos', v); }} /></label>
            )}
            {b.kind === 'horizontal' && rangeNote(b.id, 'pos', i)}
            {b.kind === 'diagonal' && (
              <>
                <label className="grid grid-cols-[minmax(0,1fr)_96px] gap-2 items-center text-[12.5px]"><span>Donji kraj (X; polazno u uglu uz ram)</span>
                  <NumInput value={Math.round(b.pos ?? dflt.diagX1)} testId={`sl-brace-pos-${i}`} ariaLabel="Donji kraj ojačanja" onCommit={(v) => { if (v !== null) commitPos(b.id, 'pos', v); }} /></label>
                {rangeNote(b.id, 'pos', i)}
                <label className="grid grid-cols-[minmax(0,1fr)_96px] gap-2 items-center text-[12.5px]"><span>Gornji kraj (X, na kosniku)</span>
                  <NumInput value={Math.round(b.pos2 ?? dflt.diagX2)} testId={`sl-brace-pos2-${i}`} ariaLabel="Gornji kraj ojačanja" onCommit={(v) => { if (v !== null) commitPos(b.id, 'pos2', v); }} /></label>
                {rangeNote(b.id, 'pos2', i)}
              </>
            )}
            {info(`tail-brace-${b.id}`)}
          </div>
        ))}
        <div className="flex flex-wrap gap-1.5">
          {KIND_OPTS.map((k) => <button key={k} className="btn btn-sm" data-testid={`sl-brace-add-${k}`} onClick={() => add(k)}><Plus size={13} />{BRACE_LABELS[k]} ojačanje</button>)}
        </div>
      </div>
    </div>
  );
}
