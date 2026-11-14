import { AlertTriangle, CheckCircle2, ChevronRight, FileDown, FlipHorizontal2, Info, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { NumInput, showNum } from '../forms/NumInput';
import {
  applyExample, CONFIRM_LABELS, confirmationState, configHash, DIM_BY_KEY, dimsFor, emptyDesign, equationsFor, fmt, GROUP_LABELS, HW_EXAMPLES, HW_ROLE_LABELS, HW_STATUS_LABELS,
  mirrorDesign, ORIGIN_LABELS, PROFILE_ROLE_LABELS, resolveGate, setDim, setSolve, SYSTEM_LABELS, systemOf,
  type ConfirmKind, type DimGroup, type ExtraDim, type GateDesign, type GateHardware, type GateProfile, type HwRole, type HwStatus, type ProfileRole,
} from '../../domain/gates/design';
import { gateCutRows, gateMass } from '../../domain/gates/production';
import { addVersion, applyTemplate, DEFAULT_INCLUDE, describeInclude, latest, newTemplate, type GateTemplate, type TemplateInclude } from '../../domain/gates/templates';
import { computeLayout, postHalfSum } from '../../domain/geometry/layout';
import { compareMaterials } from '../../domain/models/materialShape';
import { evaluateSpec, specFor, specVars } from '../../domain/models/spec';
import { gateLeafPoses, gateSpecWidth } from '../../domain/geometry/gates';
import { gateBomLines } from '../../domain/pricing/calc';
import type { Gate, Material, Project } from '../../domain/models/types';
import { useAppStore } from '../../store/useAppStore';
import { itemLabel } from '../../utils/labels';
import { uid } from '../../utils/id';
import { Modal } from '../ui/Modal';
import { GateSketch } from './GateSketch';

type Tab = 'mere' | 'delovi' | 'izrada' | 'sabloni' | 'provere';
const TABS: { id: Tab; label: string }[] = [
  { id: 'mere', label: 'Mere' }, { id: 'delovi', label: 'Okovi i profili' }, { id: 'izrada', label: 'Sastavnica i krojna lista' }, { id: 'sabloni', label: 'Šabloni' }, { id: 'provere', label: 'Provere i potvrde' },
];



function Badge({ children, tone, testId }: { children: ReactNode; tone: string; testId?: string }) {
  return <span data-testid={testId} className={`inline-block rounded px-1.5 py-0.5 text-[10.5px] font-semibold whitespace-nowrap ${tone}`}>{children}</span>;
}

function IssueRow({ level, msg }: { level: string; msg: string }) {
  const tone = level === 'error' ? 'text-[#b42318]' : level === 'warn' ? 'text-[#93370d]' : 'text-slate-600';
  const Icon = level === 'info' ? Info : AlertTriangle;
  return <div className={`flex gap-1.5 items-start text-[12.5px] ${tone}`} data-testid={`gd-issue-${level}`}><Icon size={14} className="mt-0.5 shrink-0" /><span>{msg}</span></div>;
}

export function GateDesignModal({ projectId, itemId, onClose }: { projectId: string; itemId: string; onClose: () => void }) {
  const project = useAppStore((s) => s.projects.find((p) => p.id === projectId));
  const materials = useAppStore((s) => s.materials);
  const settings = useAppStore((s) => s.settings);
  const [tab, setTab] = useState<Tab>('mere');
  const [showDims, setShowDims] = useState(true);
  const index = project ? project.items.findIndex((i) => i.id === itemId) : -1;
  const gate = project?.items[index] as (Gate | undefined);
  const layout = useMemo(() => (project ? computeLayout(project) : null), [project]);
  if (!project || !gate || gate.kind !== 'gate' || !layout) return null;
  const li = layout.items[index];
  const sys = systemOf(gate);
  const design = gate.design ?? emptyDesign(sys);
  const g: Gate = { ...gate, design };
  const res = resolveGate(g, li.clearWidth);
  const st = useAppStore.getState();
  const update = (fn: (d: GateDesign) => GateDesign, key?: string) =>
    st.mutate((p) => ({ ...p, updatedAt: new Date().toISOString(), items: p.items.map((it) => (it.id === itemId && it.kind === 'gate' ? { ...it, design: fn(it.design ?? emptyDesign(systemOf(it))) } : it)) }), key ?? null);
  const patchGate = (patch: Partial<Gate>) => st.patchItem(itemId, patch);
  const pick = (key: string) => {
    setTab('mere');
    setTimeout(() => { const el = document.querySelector<HTMLInputElement>(`[data-testid="gd-${key}"]`); el?.focus(); el?.select(); el?.scrollIntoView({ block: 'center' }); }, 30);
  };
  const errors = res.issues.filter((i) => i.level === 'error').length;
  const warns = res.issues.filter((i) => i.level === 'warn').length;
  const label = itemLabel(project.items, index);

  return (
    <Modal title={`Mere kapije — ${label} (${SYSTEM_LABELS[sys]})`} onClose={onClose} fullscreen
      headerActions={<button className="btn btn-sm" data-testid="gd-pdf" onClick={async () => { const { downloadGatePdf } = await import('../../services/pdfGate'); await downloadGatePdf(project, itemId, materials, settings); }}><FileDown size={14} />PDF mera kapije</button>}>
      <div className={`grid lg:grid-cols-[minmax(0,1fr)_400px] gap-4`} data-testid="gate-design">
        {/* skica i provere ostaju na ekranu dok se lista kota skroluje */}
        <div className="min-w-0 lg:sticky lg:top-0 lg:self-start lg:max-h-[calc(100dvh-110px)] lg:overflow-auto scroll-thin" data-testid="gd-left">
          <div className="mb-1 flex items-center gap-1 text-[12.5px]" data-testid="gd-view-toggle">
            <span className="text-muted">Prikaz:</span>
            <button className={`btn btn-sm ${!showDims ? 'btn-primary' : ''}`} data-testid="gd-view-2d" onClick={() => setShowDims(false)}>2D crtež</button>
            <button className={`btn btn-sm ${showDims ? 'btn-primary' : ''}`} data-testid="gd-view-dims" onClick={() => setShowDims(true)}>Sa kotama</button>
          </div>
          <div className="card p-2 overflow-hidden"><GateSketch gate={g} res={res} onPick={pick} showDims={showDims} postHs={[project.posts[index]?.heightMm, project.posts[index + 1]?.heightMm]} postWs={[project.posts[index]?.widthMm, project.posts[index + 1]?.widthMm]} /></div>
          <div className="mt-2 flex flex-wrap gap-2 items-center text-[12.5px]">
            {design.template ? <Badge tone="bg-violet-50 text-violet-700" testId="gd-template-ref">Šablon „{design.template.name}“ v{design.template.version}</Badge> : <Badge tone="bg-slate-100 text-slate-600">bez šablona</Badge>}
            {(['mere'] as ConfirmKind[]).map((k) => { const s = confirmationState(g, li.clearWidth, k); return <Badge key={k} testId="gd-confirm-state" tone={s === 'valid' ? 'bg-emerald-50 text-emerald-700' : s === 'stale' ? 'bg-[#fef3f2] text-[#b42318]' : 'bg-slate-100 text-slate-600'}>{s === 'valid' ? 'Mere potvrđene' : s === 'stale' ? 'Potvrda mera ne važi (konfiguracija promenjena)' : 'Mere nisu potvrđene — radna verzija'}</Badge>; })}
            <span className={errors ? 'text-[#b42318] font-semibold' : 'text-muted'}>{errors} grešaka · {warns} upozorenja</span>
          </div>
          <div className="mt-2 space-y-1" data-testid="gd-issues">
            {res.issues.map((i, n) => <IssueRow key={n} level={i.level} msg={i.msg} />)}
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1 border-b border-line mb-3" role="tablist">
            {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} data-testid={`gd-tab-${t.id}`} className={`px-3 py-1.5 text-[13px] font-semibold border-b-2 -mb-px ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted'}`} onClick={() => setTab(t.id)}>{t.label}</button>)}
          </div>
          {tab === 'mere' && <DimsTab project={project} index={index} g={g} design={design} res={res} update={update} patchGate={patchGate} clearWidth={li.clearWidth} />}
          {tab === 'delovi' && <PartsTab design={design} update={update} materials={materials} sys={sys} />}
          {tab === 'izrada' && <ProductionTab project={project} index={index} g={g} design={design} res={res} update={update} materials={materials} clearStart={li.clearStart} clearEnd={li.clearEnd} />}
          {tab === 'sabloni' && <TemplatesTab design={design} sys={sys} update={update} />}
          {tab === 'provere' && <ChecksTab g={g} design={design} update={update} clearWidth={li.clearWidth} />}
        </div>
      </div>
    </Modal>
  );
}

type Update = (fn: (d: GateDesign) => GateDesign, key?: string) => void;

/* ---------- Mere ---------- */
function DimsTab({ project, index, g, design, res, update, patchGate, clearWidth }: { project: Project; index: number; g: Gate; design: GateDesign; res: ReturnType<typeof resolveGate>; update: Update; patchGate: (p: Partial<Gate>) => void; clearWidth: number }) {
  const sys = res.system;
  // „Teren i merenje“ se retko koristi: zatvoreno je dok se ne otvori; kod klizne kapije tu je i raspoloživi prostor P, pa je otvoreno
  const [terenOpen, setTerenOpen] = useState(sys === 'cantilever' || sys === 'rail');
  const st = useAppStore.getState();
  const defs = dimsFor(sys);
  const groups = [...new Set(defs.map((d) => d.group))] as DimGroup[];
  const half = postHalfSum(project, index);
  const suggestions = suggestionsFor(design, sys);
  const setW = (w: number | null) => { if (w !== null && w > 0) st.setWidth(g.id, w + 2 * half, `w:${g.id}`); };
  return (
    <div className="space-y-3" data-testid="gd-dims">
      <div className="grid gap-2 text-[13px]">
        {g.gateType === 'sliding' && (
          <label className="flex flex-col gap-1">Izvedba klizne
            <select className="input !py-1" data-testid="gd-slide" value={design.slide ?? 'cantilever'} onChange={(e) => update((d) => ({ ...d, slide: e.target.value as GateDesign['slide'] }))}>
              <option value="cantilever">Samonoseća (kolica, rep)</option><option value="rail">Po podnoj šini</option>
            </select></label>
        )}
        <label className="flex flex-col gap-1">{g.gateType === 'sliding' ? 'Smer otvaranja' : 'Strana šarki'}
          <select className="input !py-1" data-testid="gd-opening" value={g.opening} onChange={(e) => patchGate({ opening: e.target.value as Gate['opening'] })}>
            <option value="right">{g.gateType === 'sliding' ? 'Udesno (gledano iz dvorišta)' : 'Desno'}</option><option value="left">{g.gateType === 'sliding' ? 'Ulevo' : 'Levo'}</option>
          </select></label>
        <label className="flex flex-col gap-1">Pogon
          <select className="input !py-1" data-testid="gd-drive" value={g.automation ? 'motor' : 'manual'} onChange={(e) => patchGate({ automation: e.target.value === 'motor' })}>
            <option value="manual">Ručna</option><option value="motor">Motorizovana</option>
          </select></label>
        <label className="flex flex-col gap-1">Izrada rama
          <select className="input !py-1" data-testid="gd-build" value={design.build ?? ''} onChange={(e) => update((d) => ({ ...d, build: (e.target.value || undefined) as GateDesign['build'] }))}>
            <option value="">nije poznato</option><option value="zavaren">Zavaren alu ram</option><option value="mehanicki">Mehanički sklopljen</option><option value="celicni_ram">Čelični ram, alu ispuna</option>
          </select></label>
        <label className="flex flex-col gap-1">Strana gledanja
          <select className="input !py-1" value={design.viewFrom ?? 'dvoriste'} onChange={(e) => update((d) => ({ ...d, viewFrom: e.target.value as GateDesign['viewFrom'] }))}>
            <option value="dvoriste">Iz dvorišta</option><option value="ulica">Sa ulice</option>
          </select></label>
        {sys === 'swing_double' && (
          <label className="flex flex-col gap-1">Aktivno krilo
            <select className="input !py-1" data-testid="gd-active" value={design.activeLeaf ?? ''} onChange={(e) => update((d) => ({ ...d, activeLeaf: (e.target.value || undefined) as GateDesign['activeLeaf'] }))}>
              <option value="">nije izabrano</option><option value="left">Levo</option><option value="right">Desno</option>
            </select></label>
        )}
        {sys === 'swing_double' && (
          <label className="flex items-center gap-2 mt-5"><input type="checkbox" checked={Boolean(design.overlap)} onChange={(e) => update((d) => ({ ...d, overlap: e.target.checked }))} />Krila sa preklopom / u drugoj ravni</label>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(sys === 'swing_double' || sys === 'swing_single') && <button className="btn btn-sm" data-testid="gd-mirror" onClick={() => { update((d) => mirrorDesign(d)); if (sys === 'swing_single') patchGate({ opening: g.opening === 'left' ? 'right' : 'left' }); }}><FlipHorizontal2 size={14} />Preslikaj levo / desno</button>}
        <button className="btn btn-sm" data-testid="gd-example" onClick={() => update((d) => applyExample(d, sys))} title="Popunjava samo prazne kote vrednostima iz računskih primera specifikacije, kao radnu pretpostavku">Popuni prazne kote primerom</button>
        <button className="btn btn-sm" data-testid="gd-blank" onClick={() => update(() => emptyDesign(sys))}>Prazan crtež (obriši mere)</button>
      </div>

      {/* jednačine: koju kotu računa aplikacija */}
      <div className="rounded-lg border border-line p-2.5 space-y-2" data-testid="gd-equations">
        <div className="text-[12px] font-bold uppercase text-muted">Proračun</div>
        {res.equations.map((e) => {
          const eq = equationsFor(sys).find((x) => x.id === e.id)!;
          const opts = eq.solvable;
          return (
            <div key={e.id} className="text-[13px]" data-testid={`gd-eq-${e.id}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[12px]">{e.label}</span>
                <label className="flex items-center gap-1">računa se:
                  <select className="input !py-0.5 !w-auto" data-testid={`gd-solve-${e.id}`} value={e.solve ?? ''} onChange={(ev) => update((d) => setSolve(d, e.id, ev.target.value || null))}>
                    {opts.map((k) => <option key={k} value={k}>{k === 'equal' ? 'jednaka krila (WL = WR)' : DIM_BY_KEY[k].label}</option>)}
                    <option value="">ništa — sve zadajem ja</option>
                  </select></label>
              </div>
              {e.missing.length > 0 && <div className="text-[12px] text-muted">Za proračun nedostaje: {e.missing.map((k) => DIM_BY_KEY[k]?.label ?? k).join(', ')}.</div>}
              {e.solve === null && e.residual !== null && Math.abs(e.residual) > 0.05 && (
                <div className="mt-1 rounded bg-[#fef3f2] border border-[#fecdca] p-2 text-[12.5px] text-[#b42318]" data-testid={`gd-conflict-${e.id}`}>
                  Odstupanje {fmt(Math.abs(e.residual))}. Vaši unosi su sačuvani. Koju kotu da aplikacija koriguje?
                  <div className="flex flex-wrap gap-1 mt-1">
                    {opts.filter((k) => k !== 'equal').map((k) => <button key={k} className="btn btn-sm" data-testid={`gd-fix-${e.id}-${k}`} onClick={() => update((d) => setSolve(d, e.id, k))}>{DIM_BY_KEY[k].label}</button>)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {groups.map((grp) => (
        <div key={grp}>
          {grp === 'teren' ? (
            <button type="button" className="flex w-full items-center gap-1 text-[12px] font-bold uppercase text-muted mb-1 hover:text-ink" data-testid="gd-teren-toggle" aria-expanded={terenOpen} onClick={() => setTerenOpen((o) => !o)}>
              <ChevronRight size={14} className={`transition-transform ${terenOpen ? 'rotate-90' : ''}`} />{GROUP_LABELS[grp]}
              {!terenOpen && defs.some((d) => d.group === 'teren' && res.values[d.key]?.v != null) && <span className="ml-1 normal-case font-normal">({defs.filter((d) => d.group === 'teren' && res.values[d.key]?.v != null).length} unetih)</span>}
            </button>
          ) : <div className="text-[12px] font-bold uppercase text-muted mb-1">{GROUP_LABELS[grp]}</div>}
          <div className={`divide-y divide-line rounded-lg border border-line ${grp === 'teren' && !terenOpen ? 'hidden' : ''}`}>
            {defs.filter((d) => d.group === grp).map((def) => {
              const r = res.values[def.key];
              const computed = r.origin === 'proracun';
              const sug = suggestions[def.key];
              const issues = res.issues.filter((i) => i.key === def.key && i.level !== 'info');
              const linked = design.extra.find((x) => x.link === def.key);
              return (
                <div key={def.key} className="px-2.5 py-1.5" data-testid={`gd-row-${def.key}`}>
                  <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2 items-center">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold leading-tight">{def.label}</div>
                      <div className="text-[11px] text-muted leading-tight">{def.part}{def.ref ? ` · ${def.ref}` : ''}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <NumInput value={r.v} testId={`gd-${def.key}`} ariaLabel={def.label} chain="gd-dims"
                        onCommit={(v) => (def.key === 'W' ? setW(v) : def.key === 'H' && v !== null ? (update((d) => setDim(d, 'H', v)), st.patchItem(g.id, { heightMm: v }, 'h')) : update((d) => setDim(d, def.key, v), `gd:${def.key}`))} />
                      <span className="text-[11px] text-muted w-5">{def.unit ?? 'mm'}</span>
                    </div>
                    {/* poreklo mere (ručno, proračun, šablon) ostaje samo u podacima i za čitače ekrana; brisanje = obrisati sadržaj polja */}
                    <span className="sr-only" data-testid={`gd-origin-${def.key}`}>{r.v === null && !computed ? 'nije uneto' : ORIGIN_LABELS[r.origin]}</span>
                  </div>
                  {computed && r.shadow !== null && r.shadow !== undefined && <div className="text-[11.5px] text-muted">Vaš unos {fmt(r.shadow)} je sačuvan, a kotu sada računa aplikacija.</div>}
                  {linked && <div className="text-[11.5px] text-cyan-800">Zadaje je dodatna kota „{linked.name}“.</div>}
                  {sug && sug.v !== r.v && <div className="text-[11.5px] text-amber-800 flex items-center gap-2" data-testid={`gd-suggest-${def.key}`}>Predlog {fmt(sug.v)} ({sug.from}) <button className="btn btn-sm !py-0" data-testid={`gd-accept-${def.key}`} onClick={() => update((d) => setDim(d, def.key, sug.v, 'katalog'))}>Prihvati</button></div>}
                  {issues.map((i, n) => <IssueRow key={n} level={i.level} msg={i.msg} />)}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {Object.keys(res.derived).length > 0 && (sys === 'cantilever' || sys === 'rail') && (
        <div className="rounded-lg border border-line p-2.5 text-[13px] grid grid-cols-2 gap-1" data-testid="gd-derived">
          <span>Najmanji hod Smin = W + a + e</span><b data-testid="gd-Smin">{fmt(res.derived.Smin)}</b>
          <span>Potreban bočni prostor Pmin</span><b data-testid="gd-Pmin">{fmt(res.derived.Pmin)}</b>
          <span>Odstojanje d = S − W − a</span><b>{fmt(res.derived.d)}</b>
          <span>Širina rama krila (W + a + b)</span><b>{fmt(res.derived.leafFrameW)}</b>
          {sys === 'rail' && <><span>Dužina šine</span><b>{fmt(res.derived.railLen)}</b></>}
          <span>Nedostaje prostora</span><b data-testid="gd-shortfall" className={res.derived.shortfall ? 'text-[#b42318]' : ''}>{fmt(res.derived.shortfall)}</b>
        </div>
      )}
      <ExtraDims design={design} update={update} sys={sys} />
      <p className="text-[11.5px] text-muted">Prazno polje znači da mera nije poznata; nula je važeći unos. Decimalni zarez je dozvoljen. Mere izvan poznatih granica se čuvaju uz upozorenje. Širina usvojenog otvora menja širinu kapije u projektu ({fmt(clearWidth)}).</p>
    </div>
  );
}

function suggestionsFor(d: GateDesign, sys: string): Record<string, { v: number; from: string }> {
  const out: Record<string, { v: number; from: string }> = {};
  const nom = (role: HwRole) => d.hardware.find((h) => h.role === role && typeof h.nominalGapMm === 'number');
  const hinge = (side: 'left' | 'right') => nom(side === 'left' ? 'hinge_left' : 'hinge_right') ?? nom('hinge');
  if (sys === 'swing_double') {
    const l = hinge('left'); const r = hinge('right'); const lock = nom('lock');
    if (l) out.gL = { v: l.nominalGapMm!, from: l.name };
    if (r) out.gR = { v: r.nominalGapMm!, from: r.name };
    if (lock) out.gC = { v: lock.nominalGapMm!, from: lock.name };
  }
  if (sys === 'swing_single') {
    const h = nom('hinge') ?? nom('hinge_left') ?? nom('hinge_right'); const lock = nom('lock');
    if (h) out.gH = { v: h.nominalGapMm!, from: h.name };
    if (lock) out.gZ = { v: lock.nominalGapMm!, from: lock.name };
  }
  const stop = nom('ground_stop');
  if (stop) out.gB = { v: stop.nominalGapMm!, from: stop.name };
  const frame = d.profiles.find((p) => p.role === 'frame' && typeof p.faceMm === 'number');
  if (frame && d.dims.face?.v !== undefined && d.dims.face?.v !== null) out.face = { v: frame.faceMm!, from: frame.name };
  return out;
}

function ExtraDims({ design, update, sys }: { design: GateDesign; update: Update; sys: ReturnType<typeof systemOf> }) {
  const patch = (id: string, p: Partial<ExtraDim>) => update((d) => ({ ...d, extra: d.extra.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  return (
    <div data-testid="gd-extra">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[12px] font-bold uppercase text-muted">Dodatne kote</div>
        <button className="btn btn-sm" data-testid="gd-extra-add" onClick={() => update((d) => ({ ...d, extra: [...d.extra, { id: uid('xd'), name: '', valueMm: null, part: '', ref: '', inExport: true }] }))}><Plus size={14} />Dodaj kotu</button>
      </div>
      {design.extra.length === 0 && <p className="text-[12px] text-muted">Imenovana kota vezana za deo ili crtež (npr. „bušenje šarke od vrha“). Čuva se i prikazuje u izvozu.</p>}
      {design.extra.map((x, i) => (
        <div key={x.id} className="grid grid-cols-2 sm:grid-cols-[1.3fr_90px_1fr_1fr] gap-1.5 items-center py-1 border-b border-line" data-testid={`gd-extra-${i}`}>
          <input className="input !py-1" placeholder="Naziv kote" aria-label="Naziv kote" data-testid={`gd-extra-name-${i}`} value={x.name} onChange={(e) => patch(x.id, { name: e.target.value })} />
          <NumInput value={x.valueMm} testId={`gd-extra-value-${i}`} ariaLabel="Vrednost kote" onCommit={(v) => patch(x.id, { valueMm: v })} />
          <input className="input !py-1" placeholder="Deo / crtež" aria-label="Deo" value={x.part} onChange={(e) => patch(x.id, { part: e.target.value })} />
          <input className="input !py-1" placeholder="Od – do (reference)" aria-label="Reference" value={x.ref} onChange={(e) => patch(x.id, { ref: e.target.value })} />
          <label className="text-[12px] flex items-center gap-1 col-span-2">Zadaje kotu u proračunu:
            <select className="input !py-0.5 !w-auto" data-testid={`gd-extra-link-${i}`} value={x.link ?? ''} onChange={(e) => patch(x.id, { link: e.target.value || undefined })}>
              <option value="">ne (samo zapis)</option>
              {dimsFor(sys).filter((d) => d.key !== 'W').map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select></label>
          <label className="text-[12px] flex items-center gap-1"><input type="checkbox" checked={x.inExport} onChange={(e) => patch(x.id, { inExport: e.target.checked })} />u izvozu</label>
          <button className="btn btn-sm justify-self-end" aria-label="Obriši kotu" onClick={() => update((d) => ({ ...d, extra: d.extra.filter((y) => y.id !== x.id) }))}><Trash2 size={13} /></button>
        </div>
      ))}
    </div>
  );
}

/* ---------- Okovi i profili ---------- */
const HW_ROLES_BY_SYS: Record<string, HwRole[]> = {
  swing_double: ['hinge_left', 'hinge_right', 'lock', 'drop_bolt', 'ground_stop', 'stopper', 'motor', 'other'],
  swing_single: ['hinge', 'lock', 'ground_stop', 'stopper', 'motor', 'other'],
  cantilever: ['carrier_kit', 'trolley', 'guide', 'end_roller', 'receiver', 'stopper', 'lock', 'motor', 'other'],
  rail: ['wheel', 'rail', 'guide', 'receiver', 'stopper', 'lock', 'motor', 'other'],
};

function PartsTab({ design, update, materials, sys }: { design: GateDesign; update: Update; materials: Material[]; sys: ReturnType<typeof systemOf> }) {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [role, setRole] = useState<HwRole>(HW_ROLES_BY_SYS[sys][0]);
  const catalog = [...(settings.gateHardware ?? []), ...HW_EXAMPLES];
  const sortedMats = useMemo(() => [...materials].sort(compareMaterials), [materials]);
  const patchHw = (id: string, p: Partial<GateHardware>) => update((d) => ({ ...d, hardware: d.hardware.map((h) => (h.id === id ? { ...h, ...p } : h)) }));
  const patchPr = (id: string, p: Partial<GateProfile>) => update((d) => ({ ...d, profiles: d.profiles.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  const addFromCatalog = (cid: string) => {
    const src = catalog.find((h) => h.id === cid);
    if (!src) return;
    const r: HwRole = src.role === 'hinge' && (role === 'hinge_left' || role === 'hinge_right') ? role : src.role === 'hinge' && sys === 'swing_double' ? 'hinge_left' : src.role;
    update((d) => ({ ...d, hardware: [...d.hardware.filter((h) => !(h.role === r && r !== 'other')), { ...src, id: uid('hw'), role: r, qty: r.startsWith('hinge') ? 2 : src.qty }] }));
  };
  const num = (v: number | null) => (v === null ? undefined : v);
  return (
    <div className="space-y-4" data-testid="gd-parts">
      <section>
        <div className="text-[12px] font-bold uppercase text-muted mb-1">Okovi</div>
        <div className="flex flex-wrap gap-1.5 items-center mb-2">
          <select className="input !py-1 !w-auto" aria-label="Uloga okova" data-testid="gd-hw-role" value={role} onChange={(e) => setRole(e.target.value as HwRole)}>
            {HW_ROLES_BY_SYS[sys].map((r) => <option key={r} value={r}>{HW_ROLE_LABELS[r]}</option>)}
          </select>
          <button className="btn btn-sm" data-testid="gd-hw-add" onClick={() => update((d) => ({ ...d, hardware: [...d.hardware, { id: uid('hw'), role, name: '', status: 'radna', qty: role.startsWith('hinge') ? 2 : 1 }] }))}><Plus size={14} />Dodaj ručno</button>
          <select className="input !py-1 !w-auto" aria-label="Dodaj iz kataloga" data-testid="gd-hw-catalog" value="" onChange={(e) => addFromCatalog(e.target.value)}>
            <option value="">Iz kataloga…</option>
            {catalog.filter((h) => h.role === role || (h.role === 'hinge' && role.startsWith('hinge'))).map((h) => <option key={h.id} value={h.id}>{h.name}{h.status === 'primer' ? ' — primer, proveriti' : ''}</option>)}
          </select>
        </div>
        {design.hardware.length === 0 && <p className="text-[12px] text-muted">Nijedan okov nije zadat. Može i bez fabričke šifre: upišite naziv i poznate mere.</p>}
        {design.hardware.map((h, i) => (
          <div key={h.id} className="rounded-lg border border-line p-2 mb-2 text-[12.5px]" data-testid={`gd-hw-${i}`}>
            <div className="flex flex-wrap gap-1.5 items-center">
              <select className="input !py-0.5 !w-auto" aria-label="Uloga" data-testid={`gd-hw-role-${i}`} value={h.role} onChange={(e) => patchHw(h.id, { role: e.target.value as HwRole })}>
                {Object.entries(HW_ROLE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <input className="input !py-0.5 flex-1 min-w-[140px]" placeholder="Naziv (obavezno)" aria-label="Naziv okova" data-testid={`gd-hw-name-${i}`} value={h.name} onChange={(e) => patchHw(h.id, { name: e.target.value })} />
              <input className="input !py-0.5 !w-28" placeholder="Šifra" aria-label="Šifra" value={h.code ?? ''} onChange={(e) => patchHw(h.id, { code: e.target.value || undefined })} />
              <button className="btn btn-icon !w-7 !h-7" aria-label="Ukloni okov" onClick={() => update((d) => ({ ...d, hardware: d.hardware.filter((x) => x.id !== h.id) }))}><Trash2 size={13} /></button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mt-1.5 items-end">
              <label>Kom.<NumInput value={h.qty} ariaLabel="Količina" onCommit={(v) => patchHw(h.id, { qty: v ?? 0 })} /></label>
              <label title="Dokumentovan minimum zazora (npr. kota B šarke)">Min zazor<NumInput value={h.minGapMm} testId={`gd-hw-min-${i}`} ariaLabel="Minimalni zazor" onCommit={(v) => patchHw(h.id, { minGapMm: num(v) })} /></label>
              <label>Max zazor<NumInput value={h.maxGapMm} ariaLabel="Maksimalni zazor" onCommit={(v) => patchHw(h.id, { maxGapMm: num(v) })} /></label>
              <label title="Radna ili potvrđena nominala (predlog za kotu)">Nominala<NumInput value={h.nominalGapMm} ariaLabel="Nominala" onCommit={(v) => patchHw(h.id, { nominalGapMm: num(v) })} /></label>
              <label>Max krilo<NumInput value={h.maxLeafWidthMm} ariaLabel="Najveća širina krila" onCommit={(v) => patchHw(h.id, { maxLeafWidthMm: num(v) })} /></label>
              <label>Masa kg<NumInput value={h.kg} ariaLabel="Masa komada" onCommit={(v) => patchHw(h.id, { kg: num(v) })} /></label>
            </div>
            <div className="grid sm:grid-cols-3 gap-1.5 mt-1.5">
              <input className="input !py-0.5" placeholder="Dobavljač" aria-label="Dobavljač" value={h.supplier ?? ''} onChange={(e) => patchHw(h.id, { supplier: e.target.value || undefined })} />
              <input className="input !py-0.5" placeholder="Dokument / verzija" aria-label="Dokument" value={h.doc ?? ''} onChange={(e) => patchHw(h.id, { doc: e.target.value || undefined })} />
              <input className="input !py-0.5" placeholder="Hod podešavanja" aria-label="Hod podešavanja" value={h.adjust ?? ''} onChange={(e) => patchHw(h.id, { adjust: e.target.value || undefined })} />
              <select className="input !py-0.5 sm:col-span-3" aria-label="Status podatka" value={h.status} onChange={(e) => patchHw(h.id, { status: e.target.value as HwStatus })}>
                {Object.entries(HW_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <select className="input !py-0.5 sm:col-span-3" aria-label="Veza sa cenovnikom" value={h.materialId ?? ''} onChange={(e) => patchHw(h.id, { materialId: e.target.value || undefined })}>
                <option value="">bez veze sa cenovnikom (bez cene)</option>
                {sortedMats.filter((m) => m.unit !== 'm').map((m) => <option key={m.id} value={m.id}>{m.name} ({m.sku})</option>)}
              </select>
            </div>
            {h.source && <div className="text-[11px] text-muted mt-1">Izvor: {h.source}</div>}
            <button className="btn btn-sm mt-1.5" data-testid={`gd-hw-save-${i}`} disabled={!h.name.trim()} onClick={() => updateSettings({ gateHardware: [...(settings.gateHardware ?? []).filter((x) => x.name !== h.name), { ...h, id: uid('ghw') }] })}>Sačuvaj u katalog radionice</button>
          </div>
        ))}
      </section>
      <section>
        <div className="flex items-center justify-between mb-1">
          <div className="text-[12px] font-bold uppercase text-muted">Profili</div>
          <div className="flex gap-1.5">
            <select className="input !py-1 !w-auto" aria-label="Profil iz radionice" value="" onChange={(e) => { const src = (settings.gateProfiles ?? []).find((p) => p.id === e.target.value); if (src) update((d) => ({ ...d, profiles: [...d.profiles.filter((x) => x.role !== src.role || src.role === 'other' || src.role === 'brace'), { ...src, id: uid('gp') }] })); }}>
              <option value="">Iz radionice…</option>
              {(settings.gateProfiles ?? []).map((p) => <option key={p.id} value={p.id}>{PROFILE_ROLE_LABELS[p.role]}: {p.name}</option>)}
            </select>
            <button className="btn btn-sm" data-testid="gd-profile-add" onClick={() => update((d) => ({ ...d, profiles: [...d.profiles, { id: uid('gp'), role: d.profiles.some((p) => p.role === 'frame') ? (sys === 'cantilever' && !d.profiles.some((p) => p.role === 'carrier') ? 'carrier' : 'other') : 'frame', name: '', joint: 'butt' }] }))}><Plus size={14} />Dodaj profil</button>
          </div>
        </div>
        {design.profiles.length === 0 && <p className="text-[12px] text-muted">Bez profila rama krila krojna lista ima redove „Profil rama (nije izabran)“. Profil može biti ručno zadat (naziv, širina u pogledu, kg/m) ili vezan za cenovnik.</p>}
        {design.profiles.map((p, i) => (
          <div key={p.id} className="rounded-lg border border-line p-2 mb-2 text-[12.5px]" data-testid={`gd-profile-${i}`}>
            <div className="flex flex-wrap gap-1.5 items-center">
              <select className="input !py-0.5 !w-auto" aria-label="Uloga profila" data-testid={`gd-profile-role-${i}`} value={p.role} onChange={(e) => patchPr(p.id, { role: e.target.value as ProfileRole })}>
                {Object.entries(PROFILE_ROLE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <input className="input !py-0.5 flex-1 min-w-[140px]" placeholder="Naziv profila" aria-label="Naziv profila" data-testid={`gd-profile-name-${i}`} value={p.name} onChange={(e) => patchPr(p.id, { name: e.target.value })} />
              <input className="input !py-0.5 !w-24" placeholder="Šifra" aria-label="Šifra profila" value={p.code ?? ''} onChange={(e) => patchPr(p.id, { code: e.target.value || undefined })} />
              <button className="btn btn-icon !w-7 !h-7" aria-label="Ukloni profil" onClick={() => update((d) => ({ ...d, profiles: d.profiles.filter((x) => x.id !== p.id) }))}><Trash2 size={13} /></button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 mt-1.5 items-end">
              <label>Širina u pogledu<NumInput value={p.faceMm} testId={`gd-profile-face-${i}`} ariaLabel="Širina u pogledu" onCommit={(v) => patchPr(p.id, { faceMm: num(v) })} /></label>
              <label>Dubina<NumInput value={p.depthMm} ariaLabel="Dubina profila" onCommit={(v) => patchPr(p.id, { depthMm: num(v) })} /></label>
              <label>Zid<NumInput value={p.wallMm} ariaLabel="Debljina zida" onCommit={(v) => patchPr(p.id, { wallMm: num(v) })} /></label>
              <label>kg/m<NumInput value={p.kgPerM} testId={`gd-profile-kg-${i}`} ariaLabel="Masa po metru" onCommit={(v) => patchPr(p.id, { kgPerM: num(v) })} /></label>
              {p.role === 'frame' ? (
                <label>Spoj<select className="input !py-1" data-testid={`gd-profile-joint-${i}`} value={p.joint ?? 'butt'} onChange={(e) => patchPr(p.id, { joint: e.target.value as GateProfile['joint'] })}><option value="butt">stubovi celom visinom</option><option value="miter">45° na uglovima</option></select></label>
              ) : (p.role === 'other' || p.role === 'brace') ? (
                <label>Dužina<NumInput value={p.lengthMm} ariaLabel="Dužina dela" onCommit={(v) => patchPr(p.id, { lengthMm: num(v) })} /></label>
              ) : <span />}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
              <select className="input !py-0.5 flex-1" aria-label="Veza sa cenovnikom" value={p.materialId ?? ''} onChange={(e) => patchPr(p.id, { materialId: e.target.value || undefined })}>
                <option value="">bez veze sa cenovnikom</option>
                {sortedMats.filter((m) => m.unit === 'm').map((m) => <option key={m.id} value={m.id}>{m.name} ({m.sku})</option>)}
              </select>
              <button className="btn btn-sm" disabled={!p.name.trim()} onClick={() => updateSettings({ gateProfiles: [...(settings.gateProfiles ?? []).filter((x) => x.name !== p.name), { ...p, id: uid('ggp') }] })}>Sačuvaj u radionicu</button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

/* ---------- Sastavnica i krojna lista ---------- */
function ProductionTab({ project, index, g, design, res, update, materials, clearStart, clearEnd }: { project: Project; index: number; g: Gate; design: GateDesign; res: ReturnType<typeof resolveGate>; update: Update; materials: Material[]; clearStart: number; clearEnd: number }) {
  const rows = gateCutRows(g, res, materials);
  const layout = computeLayout(project);
  const li = layout.items[index];
  const infill = useMemo(() => {
    const vars = specVars({ modelId: g.infillModelId, slopeFactor: 1, widthMm: gateSpecWidth(g, li.clearWidth), heightMm: g.heightMm, axisMm: li.axisEnd - li.axisStart, params: g.params, doubleGate: g.gateType === 'double', leafWidthsMm: g.gateType === 'double' ? gateLeafPoses(g, clearStart, clearEnd, 1).map((q) => q.widthMm) : undefined });
    const own = design.profiles.some((p) => p.role === 'frame');
    // isti materijal u više delova specifikacije sabira se u jedan red; redovi bez količine se ne prikazuju
    const acc = new Map<string, { name: string; qty: number; unit: string; kgPerM?: number; meters: number }>();
    for (const ev of evaluateSpec(specFor(g.infillModelId, useAppStore.getState().settings.modelSpecs), vars)) {
      if (own && ev.part.group === 'Ramovi') continue;
      if (!(ev.materialQty > 1e-6)) continue;
      const m = materials.find((x) => x.id === ev.part.materialId);
      const key = m?.id ?? ev.part.name;
      const cur = acc.get(key) ?? { name: m?.name ?? ev.part.name, qty: 0, unit: m?.unit ?? 'kom', kgPerM: m?.kgPerM, meters: 0 };
      cur.qty += ev.materialQty;
      if (m?.unit === 'm') cur.meters += ev.materialQty;
      acc.set(key, cur);
    }
    return [...acc.values()];
  }, [g, li, design.profiles, materials, clearStart, clearEnd]);
  const mass = gateMass(rows, design, infill.filter((f) => f.unit === 'm').map((f) => ({ name: f.name, meters: f.meters, kgPerM: f.kgPerM })));
  const bom = gateBomLines(g, li.clearWidth, materials);
  const lbl = (k: string) => DIM_BY_KEY[k]?.label ?? k;
  return (
    <div className="space-y-4 text-[12.5px]" data-testid="gd-production">
      <section>
        <div className="text-[12px] font-bold uppercase text-muted mb-1">Krojna lista kapije (radna)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left" data-testid="gd-cut-table">
            <thead className="text-muted"><tr><th className="py-1 pr-2">Sklop / deo</th><th className="pr-2">Profil</th><th className="pr-2 text-right">Kom.</th><th className="pr-2 text-right">Rezna dužina</th><th>Kraj / referenca</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-line align-top" data-testid={`gd-cut-${r.key}`}>
                  <td className="py-1 pr-2"><b>{r.assembly}</b><br />{r.part}{!r.moving && <span className="text-muted"> · fiksno</span>}</td>
                  <td className="pr-2">{r.profile}{r.code ? ` (${r.code})` : ''}</td>
                  <td className="pr-2 text-right">{r.qty}</td>
                  <td className="pr-2 text-right w-[120px]">
                    <NumInput value={r.manual ? r.lengthMm : null} placeholder={r.geometricMm !== null ? showNum(Math.round(r.geometricMm * 10) / 10) : '?'} testId={`gd-cut-len-${r.key}`} ariaLabel={`Rezna dužina: ${r.part}`}
                      onCommit={(v) => update((d) => { const cuts = { ...d.cuts }; if (v === null) delete cuts[r.key]; else cuts[r.key] = v; return { ...d, cuts }; })} />
                    {r.manual && r.geometricMm !== null && Math.abs(r.lengthMm! - r.geometricMm) > 0.05 && <div className="text-amber-800" data-testid={`gd-cut-diff-${r.key}`}>geom. {fmt(r.geometricMm)} ({r.lengthMm! - r.geometricMm > 0 ? '+' : ''}{fmt(r.lengthMm! - r.geometricMm)})</div>}
                    {r.missing.length > 0 && <div className="text-[#b42318]" data-testid={`gd-cut-missing-${r.key}`}>nedostaje: {r.missing.map(lbl).join(', ')} — unesite u „Mere“</div>}
                  </td>
                  <td className="text-muted">{r.ends}<br />{r.ref}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted mt-1">Prazno polje dužine = geometrijska mera (sivo). Upisana mera je ručna rezna mera i prikazuje razliku. Redovi sa merom ulaze u krojnu listu i plan rezanja projekta (rez testere i nabavne šipke).</p>
      </section>
      <section data-testid="gd-mass">
        <div className="text-[12px] font-bold uppercase text-muted mb-1">Masa (procena)</div>
        <div>Pokretni sklop: <b data-testid="gd-mass-moving">{mass.movingKg.toFixed(1).replace('.', ',')} kg</b>{mass.unknown.some((u) => mass.lines.find((l) => l.name === u)?.moving) ? ' + nepoznato' : ''} · Fiksni delovi: <b>{mass.fixedKg.toFixed(1).replace('.', ',')} kg</b></div>
        {mass.unknown.length > 0 && <div className="text-amber-800" data-testid="gd-mass-unknown">Zbir je nepotpun — bez mase ({mass.unknown.length}): {[...new Set(mass.unknown)].join('; ')}. Masu dodajte kao kg/m profila ili u cenovniku.</div>}
        <div className="text-muted">Fiksna kolica i motor ne ulaze u pokretnu masu. Masa profila = komada × dužina / 1000 × kg/m.</div>
      </section>
      <section>
        <div className="text-[12px] font-bold uppercase text-muted mb-1">Sastavnica kapije</div>
        <table className="w-full text-left" data-testid="gd-bom">
          <tbody>
            {infill.map((f, i) => <tr key={`i${i}`} className="border-t border-line"><td className="py-0.5">Ispuna: {f.name}</td><td className="text-right">{f.qty.toFixed(f.unit === 'm' ? 2 : 0).replace('.', ',')} {f.unit}</td></tr>)}
            {bom.map((b, i) => { const m = materials.find((x) => x.id === b.materialId); return <tr key={`b${i}`} className="border-t border-line" data-testid="gd-bom-line"><td className="py-0.5">{b.group}: {m?.name ?? b.label}{!m && <span className="text-muted"> (bez cene)</span>}</td><td className="text-right">{b.materialId.startsWith('gate-m:') || m?.unit === 'm' ? `${b.qty.toFixed(2).replace('.', ',')} m` : `${b.qty} kom`}</td></tr>; })}
          </tbody>
        </table>
        <p className="text-muted mt-1">Ove stavke ulaze u obračun projekta. Deo bez veze sa cenovnikom ostaje u sastavnici sa nazivom, bez cene.</p>
      </section>
    </div>
  );
}

/* ---------- Šabloni ---------- */
function TemplatesTab({ design, sys, update }: { design: GateDesign; sys: ReturnType<typeof systemOf>; update: Update }) {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const templates = settings.gateTemplates ?? [];
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'gate' | 'detail'>('gate');
  const [inc, setInc] = useState<TemplateInclude>(DEFAULT_INCLUDE);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const by = settings.userName || 'radnik';
  const save = () => {
    const t = newTemplate(uid('gtpl'), name.trim(), scope, scope === 'gate' ? sys : undefined, design, inc, by, note || undefined);
    updateSettings({ gateTemplates: [...templates, t] });
    update((d) => ({ ...d, template: { id: t.id, name: t.name, version: 1 } }));
    setMsg(`Šablon „${t.name}“ sačuvan (v1).`); setName(''); setNote('');
  };
  const cur = design.template ? templates.find((t) => t.id === design.template!.id) : undefined;
  const saveVersion = () => {
    if (!cur) return;
    const t = addVersion(cur, design, inc, by, note || undefined);
    updateSettings({ gateTemplates: templates.map((x) => (x.id === t.id ? t : x)) });
    update((d) => ({ ...d, template: { id: t.id, name: t.name, version: latest(t).version } }));
    setMsg(`Sačuvana nova verzija v${latest(t).version} šablona „${t.name}“. Poslovi sa ranijom verzijom zadržavaju svoje mere.`);
  };
  const toggle = (k: keyof TemplateInclude) => setInc((x) => ({ ...x, [k]: !x[k] }));
  return (
    <div className="space-y-4 text-[13px]" data-testid="gd-templates">
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-2 py-1.5 flex gap-1.5 items-center" data-testid="gd-tpl-msg"><CheckCircle2 size={14} />{msg}</div>}
      <section className="rounded-lg border border-line p-2.5 space-y-2">
        <div className="font-bold">Šta šablon prenosi</div>
        <div className="flex flex-wrap gap-3">
          {([['dims', 'Kote (zazori, prepusti, rep, kolica, okovi)'], ['rules', 'Pravila proračuna'], ['parts', 'Delovi, okovi, profili, rezne mere'], ['extra', 'Dodatne kote'], ['field', 'Terenske mere (ceo primer)']] as [keyof TemplateInclude, string][]).map(([k, l]) => (
            <label key={k} className="flex items-center gap-1.5"><input type="checkbox" data-testid={`gd-inc-${k}`} checked={inc[k]} onChange={() => toggle(k)} />{l}</label>
          ))}
        </div>
        <input className="input !py-1" placeholder="Napomena uz verziju (neobavezno)" aria-label="Napomena uz verziju" value={note} onChange={(e) => setNote(e.target.value)} />
      </section>
      <section className="rounded-lg border border-line p-2.5 space-y-2">
        <div className="font-bold">Sačuvaj kao šablon</div>
        <div className="flex flex-wrap gap-1.5">
          <input className="input !py-1 flex-1 min-w-[180px]" placeholder="Naziv šablona" aria-label="Naziv šablona" data-testid="gd-tpl-name" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="input !py-1 !w-auto" aria-label="Vrsta šablona" value={scope} onChange={(e) => setScope(e.target.value as 'gate' | 'detail')}>
            <option value="gate">Kompletna kapija</option><option value="detail">Ponovljiv detalj</option>
          </select>
          <button className="btn btn-sm btn-primary" data-testid="gd-tpl-save" disabled={!name.trim()} onClick={save}>Sačuvaj kao šablon</button>
        </div>
        {cur && <button className="btn btn-sm" data-testid="gd-tpl-version" onClick={saveVersion}>Sačuvaj novu verziju šablona „{cur.name}“ (sada v{latest(cur).version})</button>}
      </section>
      <section>
        <div className="font-bold mb-1">Učitaj šablon</div>
        {templates.length === 0 && <p className="text-muted">Još nema sačuvanih šablona.</p>}
        {templates.map((t) => <TemplateRow key={t.id} t={t} sys={sys} onApply={(ver) => { update((d) => applyTemplate(d, t, t.versions.find((v) => v.version === ver)!)); setMsg(`Učitan šablon „${t.name}“ v${ver}. Zavisne kote su preračunate za ovaj otvor.`); }}
          onDelete={() => updateSettings({ gateTemplates: templates.filter((x) => x.id !== t.id) })} />)}
      </section>
      <p className="text-[11.5px] text-muted">Šabloni se čuvaju u podacima aplikacije radionice i važe za sve projekte. Posao čuva svoje vrednosti i broj verzije; izmena šablona menja posao samo kad je ponovo učitate.</p>
    </div>
  );
}

function TemplateRow({ t, sys, onApply, onDelete }: { t: GateTemplate; sys: string; onApply: (version: number) => void; onDelete: () => void }) {
  const [ver, setVer] = useState(latest(t).version);
  const v = t.versions.find((x) => x.version === ver) ?? latest(t);
  const other = t.system && t.system !== sys;
  return (
    <div className="rounded-lg border border-line p-2 mb-1.5" data-testid="gd-tpl-row">
      <div className="flex flex-wrap items-center gap-1.5">
        <b className="flex-1 min-w-[140px]">{t.name}</b>
        <span className="text-[11.5px] text-muted">{t.scope === 'gate' ? `kapija${t.system ? ` · ${SYSTEM_LABELS[t.system]}` : ''}` : 'detalj'}</span>
        <select className="input !py-0.5 !w-auto" aria-label="Verzija" value={ver} onChange={(e) => setVer(Number(e.target.value))}>
          {t.versions.map((x) => <option key={x.version} value={x.version}>v{x.version}</option>)}
        </select>
        <button className="btn btn-sm" data-testid="gd-tpl-apply" onClick={() => onApply(ver)}>Učitaj</button>
        <button className="btn btn-icon !w-7 !h-7" aria-label="Obriši šablon" onClick={onDelete}><Trash2 size={13} /></button>
      </div>
      <div className="text-[11.5px] text-muted">v{v.version} · {new Date(v.savedAt).toLocaleString('sr-RS')} · {v.by} · prenosi: {describeInclude(v.include)}{v.note ? ` · ${v.note}` : ''}</div>
      {other && <div className="text-[11.5px] text-amber-800">Šablon je za drugi tip kapije: prenose se samo kote koje ovaj tip koristi.</div>}
    </div>
  );
}

/* ---------- Provere i potvrde ---------- */
function ChecksTab({ g, design, update, clearWidth }: { g: Gate; design: GateDesign; update: Update; clearWidth: number }) {
  const by = useAppStore((s) => s.settings.userName) || 'radnik';
  return (
    <div className="space-y-4 text-[13px]" data-testid="gd-checks">
      <section className="space-y-1.5">
        <div className="font-bold">Potvrde za ovaj posao</div>
        <p className="text-[12px] text-muted">Potvrda unetih mera je odvojena od potvrde nosivosti, bezbednosti i kompatibilnosti. Potvrda važi samo za konfiguraciju za koju je data.</p>
        {(Object.keys(CONFIRM_LABELS) as ConfirmKind[]).map((k) => {
          const s = confirmationState(g, clearWidth, k);
          const last = [...design.confirmations].reverse().find((c) => c.kind === k);
          return (
            <div key={k} className="flex flex-wrap items-center gap-2 rounded border border-line px-2 py-1.5" data-testid={`gd-confirm-${k}`}>
              <span className="flex-1 min-w-[180px]">{CONFIRM_LABELS[k]}</span>
              <Badge tone={s === 'valid' ? 'bg-emerald-50 text-emerald-700' : s === 'stale' ? 'bg-[#fef3f2] text-[#b42318]' : 'bg-slate-100 text-slate-600'}>{s === 'valid' ? `potvrdio ${last?.by}` : s === 'stale' ? 'ne važi za izmenjenu konfiguraciju' : 'nije potvrđeno'}</Badge>
              <button className="btn btn-sm" data-testid={`gd-confirm-btn-${k}`} onClick={() => update((d) => ({ ...d, confirmations: [...d.confirmations.filter((c) => c.kind !== k), { kind: k, hash: configHash({ ...g, design: d }, clearWidth), at: new Date().toISOString(), by }] }))}>Potvrdi</button>
            </div>
          );
        })}
      </section>
      <section className="space-y-1.5">
        <div className="font-bold">Putanja krila / trasa</div>
        <div className="flex flex-wrap gap-1.5">
          <select className="input !py-1 !w-auto" data-testid="gd-path" value={design.path?.status ?? 'nije'} onChange={(e) => update((d) => ({ ...d, path: { ...d.path, status: e.target.value as 'nije' | 'ok' | 'problem' } }))}>
            <option value="nije">nije provereno</option><option value="ok">provereno na terenu — slobodno</option><option value="problem">postoji prepreka</option>
          </select>
          <input className="input !py-1 flex-1" placeholder="Prepreke, pad, kritična tačka …" aria-label="Napomena o putanji" value={design.path?.note ?? ''} onChange={(e) => update((d) => ({ ...d, path: { status: d.path?.status ?? 'nije', note: e.target.value } }))} />
        </div>
      </section>
      {g.automation && (
        <section className="space-y-1.5">
          <div className="font-bold">Pogon</div>
          <div className="grid sm:grid-cols-3 gap-1.5">
            <input className="input !py-1" placeholder="Model pogona" aria-label="Model pogona" value={design.drive?.model ?? ''} onChange={(e) => update((d) => ({ ...d, drive: { ...d.drive, model: e.target.value } }))} />
            <input className="input !py-1" placeholder="Dokument" aria-label="Dokument pogona" value={design.drive?.doc ?? ''} onChange={(e) => update((d) => ({ ...d, drive: { ...d.drive, doc: e.target.value } }))} />
            <select className="input !py-1" aria-label="Procena rizika" value={design.drive?.risk ?? 'nije'} onChange={(e) => update((d) => ({ ...d, drive: { ...d.drive, risk: e.target.value as 'nije' | 'u_toku' | 'uradjena' } }))}>
              <option value="nije">procena rizika nije urađena</option><option value="u_toku">u toku</option><option value="uradjena">urađena</option>
            </select>
          </div>
        </section>
      )}
      <section className="space-y-1.5">
        <div className="font-bold">Konfiguracioni dokument / napomena</div>
        <input className="input !py-1" placeholder="Broj ili naziv konfiguracionog lista dobavljača" aria-label="Konfiguracioni dokument" value={design.configDoc ?? ''} onChange={(e) => update((d) => ({ ...d, configDoc: e.target.value || undefined }))} />
        <textarea className="input min-h-[60px]" placeholder="Napomena za radionicu" aria-label="Napomena" value={design.notes ?? ''} onChange={(e) => update((d) => ({ ...d, notes: e.target.value || undefined }))} />
      </section>
    </div>
  );
}
