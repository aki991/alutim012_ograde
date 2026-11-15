import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  POS_LABELS, resolveSliding, slidingBom, variantTitle,
  type CheckLevel, type PosKey, type SlidingActuation, type SlidingBomItem, type SlidingResult, type SlidingSpec, type SlidingSupport,
} from '../../domain/gates/slidingAssembly';
import { dimDefault, dimOf, isPartOn, partsFor, PART_GROUP_LABELS, type DimDef, type PartDef, type PartGroup } from '../../domain/gates/slidingParts';
import { BRACE_LABELS, type BraceKind, type TailBrace } from '../../domain/gates/slidingTail';
import { materialShape, sectionFace } from '../../domain/models/materialShape';
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
export function SlidingForm({ spec, W, H, opening, onSpec, onWidth, onHeight, onFrameBottom, onOpening, slideId, selectedPart, onSelectPart }: SlidingFormProps) {
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
    const undefinedCount = items.filter((b) => !b.materialId || !materials.some((m) => m.id === b.materialId)).length;
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
        {isOpen && <div className="px-2.5 pb-2.5"><SlidingPartBody part={p} spec={spec} res={res} bom={bom} onSpec={onSpec} onFrameBottom={onFrameBottom} /></div>}
      </div>
    );
  };

  return (
    <div className="space-y-2" data-testid="sliding-form">
      <div className="rounded-lg bg-slate-50 border border-line px-3 py-2 text-[12.5px]">
        <div className="font-semibold" data-testid="sl-variant">{variantTitle(spec)}</div>
        <div className="text-muted">{spec.confirmed ? 'Mere potvrđene na terenu.' : 'Radni nacrt: ilustrativna geometrija — svetli otvor, okov, graničnike i montažne mere potvrditi za stvarni posao.'}</div>
      </div>
      <label className="flex flex-col gap-1 text-[13px]">Naziv varijante
        <input className="input !py-1" data-testid="sl-name" value={spec.name} onChange={(e) => onSpec({ name: e.target.value }, 'name')} />
      </label>
      <div className="grid gap-1 text-[13px]"><span>Oslonac</span>
        <Seg<SlidingSupport> testId="sl-support" value={spec.support} options={[['ground_rail', 'Na donjoj šini'], ['cantilever', 'Samonoseća']]} onChange={(v) => onSpec({ support: v })} />
      </div>
      <div className="grid gap-1 text-[13px]"><span>Pogon</span>
        <Seg<SlidingActuation> testId="sl-actuation" value={spec.actuation} options={[['manual', 'Ručna'], ['motor', 'Motorna']]} onChange={(v) => onSpec({ actuation: v })} />
      </div>
      <div className="grid gap-1 text-[13px]"><span>Smer otvaranja (gledano iz dvorišta)</span>
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
                    <td className="py-0.5 pr-1">{b.name}<span className="block text-muted">{mat ? mat.name : <span className="text-amber-800">nije definisano</span>} · {b.make}{b.kit ? ' · deo kompleta motora' : ''}{b.confirm ? ' · potvrditi' : ''}{b.note ? ` · ${b.note}` : ''}</span></td>
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

/** red stavke sastavnice u kartici dela: broj komada i materijal iz cenovnika ili novi okov; bez izbora piše „nije definisano“ */
function MaterialRow({ item, spec, materials, onSpec, onAdd }: { item: SlidingBomItem; spec: SlidingSpec; materials: Material[]; onSpec: (p: Partial<SlidingSpec>) => void; onAdd: (name: string, sku: string) => void }) {
  const profile = isProfile(item);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const options = materials.filter((m) => (profile ? m.category === 'profil' : HW_CATEGORIES.includes(m.category)));
  const chosen = item.materialId ? materials.find((m) => m.id === item.materialId) : undefined;
  const setMat = (id: string) => {
    const pm = { ...(spec.partMat ?? {}) };
    if (id) pm[item.key] = id; else delete pm[item.key];
    onSpec({ partMat: pm });
  };
  return (
    <div data-testid={`sl-matrow-${item.key}`} className="space-y-1">
      <div className="flex items-center gap-2 text-[12.5px]">
        <span className="flex-1 leading-tight">{item.name}{item.confirm && <span className="text-[11px] text-muted"> · potvrditi</span>}</span>
        {!profile && item.key !== 'rackMounts' && (
          <label className="flex items-center gap-1 text-[11.5px] text-muted">kom<span className="w-[56px]"><NumInput value={item.qty} testId={`sl-qty-${item.key}`} ariaLabel={`Broj komada: ${item.name}`} onCommit={(v) => { const q = { ...(spec.qtys ?? {}) }; if (v === null) delete q[item.key]; else q[item.key] = Math.max(0, Math.round(v)); onSpec({ qtys: q }); }} /></span></label>
        )}
      </div>
      <div className="flex gap-1.5">
        <select className="input !py-1 flex-1 min-w-0" aria-label={`Materijal: ${item.name}`} data-testid={`sl-mat-${item.key}`} value={chosen ? chosen.id : ''} onChange={(e) => setMat(e.target.value)}>
          <option value="">— nije definisano —</option>
          {options.map((m) => <option key={m.id} value={m.id}>{m.name}{m.sku ? ` (${m.sku})` : ''}</option>)}
        </select>
        <button className="btn btn-sm shrink-0" data-testid={`sl-mat-new-${item.key}`} onClick={() => setAdding((a) => !a)}><Plus size={14} />{profile ? 'Novi profil' : 'Novi okov'}</button>
      </div>
      {chosen && chosen.unitPrice === 0 && <div className="text-[11px] text-amber-800">Cena nije upisana: upišite je u „Materijali i cene“.</div>}
      {adding && (
        <div className="grid sm:grid-cols-[1fr_120px_auto] gap-1.5 items-center">
          <input className="input !py-1" placeholder={profile ? 'Naziv profila (obavezno)' : 'Naziv okova (obavezno)'} aria-label="Naziv" data-testid={`sl-newmat-name-${item.key}`} value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input !py-1" placeholder="Šifra" aria-label="Šifra" value={sku} onChange={(e) => setSku(e.target.value)} />
          <button className="btn btn-sm btn-primary" disabled={!name.trim()} data-testid={`sl-newmat-add-${item.key}`} onClick={() => { onAdd(name, sku); setName(''); setSku(''); setAdding(false); }}>Dodaj</button>
          <p className="sm:col-span-3 text-[11px] text-muted">Upisuje se i u „Materijali i cene“ ({profile ? 'profil, cena po metru' : 'okov, cena po komadu'}); cenu upišite tamo.</p>
        </div>
      )}
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
export function SlidingPartBody({ part: p, spec, res, bom, onSpec, onFrameBottom, onRemove }: {
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
  const addMaterial = (item: SlidingBomItem, name: string, sku: string) => {
    const profile = isProfile(item);
    const mat: Material = { id: uid(profile ? 'mat_prof' : 'mat_okov'), sku: sku.trim() || `${profile ? 'PROF' : 'OKOV'}-${uid('').slice(-5).toUpperCase()}`, name: name.trim(), category: profile ? 'profil' : 'okov', unit: profile ? 'm' : 'kom', unitPrice: 0, wastePercent: 0, demo: false };
    useAppStore.getState().upsertMaterial(mat);
    onSpec({ partMat: { ...(spec.partMat ?? {}), [item.key]: mat.id } });
  };
  return (
    <div className="space-y-1.5" data-testid={`sl-partbody-${p.key}`}>
      {p.note && <p className="text-[11.5px] text-muted">{p.note}</p>}
      {!p.leaf && !onRemove && (
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" data-testid={`sl-on-${p.key}`} checked={placed} onChange={(e) => onSpec(withPartOn(spec, p.key, e.target.checked))} />Postavljen na kapiju</label>
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
      {placed && p.key === 'tail' && <TailEditor spec={spec} res={res} onSpec={onSpec} />}
      {placed && p.key !== 'tail' && items.some(isProfile) && (
        <div className="space-y-1.5" data-testid={`sl-part-profiles-${p.key}`}>
          {items.filter(isProfile).map((b) => <ProfileSelect key={b.key} label={`Profil: ${b.name}`} value={b.materialId} materials={materials} testId={`sl-profile-${b.key}`}
            onPick={(m) => { const pm = { ...(spec.partMat ?? {}) }; if (m) pm[b.key] = m.id; else delete pm[b.key]; onSpec({ partMat: pm }); }} />)}
        </div>
      )}
      {placed && items.some((b) => !isProfile(b)) && (
        <div className="rounded-md bg-slate-50 p-2 space-y-2" data-testid={`sl-part-bom-${p.key}`}>
          <div className="text-[11px] font-bold uppercase text-muted">Okov iz cenovnika</div>
          {items.filter((b) => !isProfile(b)).map((b) => <MaterialRow key={b.key} item={b} spec={spec} materials={materials} onSpec={onSpec} onAdd={(n, s) => addMaterial(b, n, s)} />)}
        </div>
      )}
      {onRemove && <button className="btn btn-sm btn-danger" data-testid={`sl-remove-${p.key}`} onClick={onRemove}>Ukloni sa kapije</button>}
    </div>
  );
}

/** širina cevi u pogledu spreda (mm) iz izabranog profila */
const faceOf = (m: Material): number => { const sh = materialShape(m); return sh.type === 'linear' ? Math.round(sectionFace(sh.section, 0).face * 10) / 10 : 0; };

/** padajući meni sa cevima i profilima iz cenovnika; izbor određuje i širinu cevi na crtežu */
function ProfileSelect({ label, value, materials, onPick, testId }: { label: string; value?: string; materials: Material[]; onPick: (m: Material | null) => void; testId: string }) {
  const options = materials.filter((m) => materialShape(m).type === 'linear');
  const chosen = value ? materials.find((m) => m.id === value) : undefined;
  return (
    <label className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 items-center text-[12.5px]">
      <span className="leading-tight">{label}{chosen && <span className="block text-[11px] text-muted">širina u pogledu {faceOf(chosen)} mm</span>}</span>
      <select className="input !py-1 min-w-0" aria-label={label} data-testid={testId} value={chosen ? chosen.id : ''} onChange={(e) => onPick(materials.find((m) => m.id === e.target.value) ?? null)}>
        <option value="">— izaberite profil —</option>
        {options.map((m) => <option key={m.id} value={m.id}>{m.name}{m.sku ? ` (${m.sku})` : ''}</option>)}
      </select>
    </label>
  );
}

/**
 * Rep samonoseće kapije: profili kosnika i donje pojasnice (padajući meni), ojačanja (bez, ili više njih: uspravno, vodoravno, koso)
 * sa svojim položajem i profilom. Uz svaku cev su dužina i uglovi sečenja, koji idu u krojnu listu.
 */
function TailEditor({ spec, res, onSpec }: { spec: SlidingSpec; res: SlidingResult; onSpec: (p: Partial<SlidingSpec>) => void }) {
  const materials = useAppStore((s) => s.materials);
  const braces: TailBrace[] = spec.braces ?? [{ id: 'b1', kind: 'vertical' }];
  const fh = res.frameHeight; const fb = spec.frameBottomY; const W = res.W;
  const dflt = res.tailDefaults ?? { vertical: Math.round(res.pos.tailBrace.value), horizontal: Math.round(fb + fh * 0.62), diagX1: W, diagX2: Math.round(res.pos.tailBrace.value) };
  const member = (key: string) => res.tail?.find((m) => m.bomKey === key);
  const info = (key: string) => {
    const m = member(key);
    if (!m) return <p className="text-[11.5px] text-amber-800">Cev ne staje na ovom položaju.</p>;
    const d = (n: number) => String(n).replace('.', ',');
    const e = (a: number[]) => (a.length > 1 ? `V ${a.map(d).join('° + ')}` : d(a[0] ?? 90));
    return <p className="text-[11.5px] text-muted" data-testid={`sl-cutinfo-${key}`}>dužina {m.len} mm · rez pod uglom {e(m.ends[0])}° / {e(m.ends[1])}° (90° = ravan rez; V = zasek u dva reza)</p>;
  };
  const pickMain = (key: 'tail-diag' | 'tail-bottom', dimKey: string) => (m: Material | null) => {
    const pm = { ...(spec.partMat ?? {}) }; const dims = { ...(spec.dims ?? {}) };
    if (m) { pm[key] = m.id; const w = faceOf(m); if (w > 0) dims[dimKey] = w; } else { delete pm[key]; delete dims[dimKey]; }
    onSpec({ partMat: pm, dims });
  };
  const setBraces = (next: TailBrace[]) => onSpec({ braces: next });
  const patchBrace = (id: string, p: Partial<TailBrace>) => setBraces(braces.map((b) => (b.id === id ? { ...b, ...p } : b)));
  const pickBrace = (b: TailBrace) => (m: Material | null) => {
    const pm = { ...(spec.partMat ?? {}) }; const key = `tail-brace-${b.id}`;
    if (m) pm[key] = m.id; else delete pm[key];
    onSpec({ partMat: pm, braces: braces.map((x) => (x.id === b.id ? { ...x, w: m && faceOf(m) > 0 ? faceOf(m) : undefined } : x)) });
  };
  const add = (kind: BraceKind) => setBraces([...braces, { id: uid('br').slice(-6), kind }]);
  const KIND_OPTS: BraceKind[] = ['vertical', 'horizontal', 'diagonal'];
  return (
    <div className="space-y-2" data-testid="sl-tail-editor">
      <ProfileSelect label="Profil kosnika" value={spec.partMat?.['tail-diag']} materials={materials} onPick={pickMain('tail-diag', 'tail.diag.w')} testId="sl-profile-tail-diag" />
      {info('tail-diag')}
      <ProfileSelect label="Profil donje pojasnice" value={spec.partMat?.['tail-bottom']} materials={materials} onPick={pickMain('tail-bottom', 'tail.bottom.w')} testId="sl-profile-tail-bottom" />
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
            <ProfileSelect label="Profil" value={spec.partMat?.[`tail-brace-${b.id}`]} materials={materials} onPick={pickBrace(b)} testId={`sl-brace-profile-${i}`} />
            {b.kind === 'vertical' && (
              <label className="grid grid-cols-[minmax(0,1fr)_96px] gap-2 items-center text-[12.5px]"><span>Položaj (X od početka krila)</span>
                <NumInput value={Math.round(b.pos ?? dflt.vertical)} testId={`sl-brace-pos-${i}`} ariaLabel="Položaj ojačanja" onCommit={(v) => { if (v !== null) patchBrace(b.id, { pos: Math.round(v) }); }} /></label>
            )}
            {b.kind === 'horizontal' && (
              <label className="grid grid-cols-[minmax(0,1fr)_96px] gap-2 items-center text-[12.5px]"><span>Visina od tla</span>
                <NumInput value={Math.round(b.pos ?? dflt.horizontal)} testId={`sl-brace-pos-${i}`} ariaLabel="Visina ojačanja" onCommit={(v) => { if (v !== null) patchBrace(b.id, { pos: Math.round(v) }); }} /></label>
            )}
            {b.kind === 'diagonal' && (
              <>
                <label className="grid grid-cols-[minmax(0,1fr)_96px] gap-2 items-center text-[12.5px]"><span>Donji kraj (X; polazno u uglu uz ram)</span>
                  <NumInput value={Math.round(b.pos ?? dflt.diagX1)} testId={`sl-brace-pos-${i}`} ariaLabel="Donji kraj ojačanja" onCommit={(v) => { if (v !== null) patchBrace(b.id, { pos: Math.round(v) }); }} /></label>
                <label className="grid grid-cols-[minmax(0,1fr)_96px] gap-2 items-center text-[12.5px]"><span>Gornji kraj (X, na kosniku)</span>
                  <NumInput value={Math.round(b.pos2 ?? dflt.diagX2)} testId={`sl-brace-pos2-${i}`} ariaLabel="Gornji kraj ojačanja" onCommit={(v) => { if (v !== null) patchBrace(b.id, { pos2: Math.round(v) }); }} /></label>
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
