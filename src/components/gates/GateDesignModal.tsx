import { AlertTriangle, ChevronRight, FileDown, FlipHorizontal2, Info, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { NumInput } from '../forms/NumInput';
import {
  applyExample, DIM_BY_KEY, dimsFor, emptyDesign, equationsFor, fmt, GROUP_LABELS, HW_ROLE_LABELS,
  mirrorDesign, missingHardware, ORIGIN_LABELS, requiredHardware, resolveGate, setDim, setSolve, SYSTEM_LABELS, systemOf,
  type DimGroup, type ExtraDim, type GateDesign, type GateHardware, type HwRole,
} from '../../domain/gates/design';
import { computeLayout, postHalfSum } from '../../domain/geometry/layout';
import { evaluateSpec, specFor, specVars } from '../../domain/models/spec';
import { gateLeafPoses, gateSpecWidth } from '../../domain/geometry/gates';
import { gateBomLines } from '../../domain/pricing/calc';
import type { Gate, Material, Project } from '../../domain/models/types';
import { useAppStore } from '../../store/useAppStore';
import { itemLabel } from '../../utils/labels';
import { uid } from '../../utils/id';
import { SaveGateModelDialog } from './SaveGateModelDialog';
import { Modal } from '../ui/Modal';
import { GateSketch } from './GateSketch';

type Tab = 'mere' | 'delovi' | 'izrada';
const TABS: { id: Tab; label: string }[] = [
  { id: 'mere', label: 'Mere' }, { id: 'delovi', label: 'Okovi' }, { id: 'izrada', label: 'Sastavnica' },
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
  const [saveOpen, setSaveOpen] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
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
    <Modal title={`Mere kapije — ${design.template?.name ?? label} (${SYSTEM_LABELS[sys]})`} onClose={onClose} fullscreen
      headerActions={<><button className="btn btn-sm" data-testid="gd-save-model" onClick={() => setSaveOpen(true)}>Sačuvaj kao model</button><button className="btn btn-sm" data-testid="gd-pdf" onClick={async () => { const { downloadGatePdf } = await import('../../services/pdfGate'); await downloadGatePdf(project, itemId, materials, settings); }}><FileDown size={14} />PDF mera kapije</button></>}>
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
            {design.template ? <Badge tone="bg-violet-50 text-violet-700" testId="gd-template-ref">Model „{design.template.name}“ v{design.template.version}</Badge> : <Badge tone="bg-slate-100 text-slate-600">nije sačuvano kao model</Badge>}
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
          {tab === 'delovi' && <PartsTab g={g} design={design} update={update} materials={materials} sys={sys} />}
          {tab === 'izrada' && <ProductionTab project={project} index={index} g={g} materials={materials} clearStart={li.clearStart} clearEnd={li.clearEnd} />}
        </div>
      </div>
      {savedMsg && <p className="text-[12.5px] text-emerald-700 mt-2" data-testid="gd-model-msg">{savedMsg}</p>}
      {saveOpen && <SaveGateModelDialog gate={g} clearWidthMm={li.clearWidth} defaultName={label} onClose={() => setSaveOpen(false)} onSaved={(id, nm, ver) => { update((d) => ({ ...d, template: { id, name: nm, version: ver } })); setSaveOpen(false); setSavedMsg(`Model „${nm}“ sačuvan (v${ver}).`); }} />}
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

function PartsTab({ g, design, update, materials, sys }: { g: Gate; design: GateDesign; update: Update; materials: Material[]; sys: ReturnType<typeof systemOf> }) {
  const upsertMaterial = useAppStore((s) => s.upsertMaterial);
  const [role, setRole] = useState<HwRole>(HW_ROLES_BY_SYS[sys][0]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [supplier, setSupplier] = useState('');
  const missing = missingHardware({ ...g, design }, sys);
  const patchHw = (id: string, p: Partial<GateHardware>) => update((d) => ({ ...d, hardware: d.hardware.map((h) => (h.id === id ? { ...h, ...p } : h)) }));
  const num = (v: number | null) => (v === null ? undefined : v);
  // okov se pravi ručno; čim se napravi, upisuje se i u „Materijali i cene“ (cena 0 dok se ne upiše), pa je tamo vidljiv i za sledeće poslove
  const add = () => {
    const nm = name.trim();
    if (!nm) return;
    const existing = materials.find((m) => m.category === 'okov' && m.name.trim().toLowerCase() === nm.toLowerCase());
    const mat: Material = existing ?? { id: uid('mat_okov'), sku: code.trim() || `OKOV-${uid('').slice(-5).toUpperCase()}`, name: nm, category: 'okov', unit: 'kom', unitPrice: 0, wastePercent: 0, demo: false };
    if (!existing) upsertMaterial(mat);
    const qty = requiredHardware(g, sys).find((r) => r.role === role)?.qty ?? 1;
    update((d) => ({ ...d, hardware: [...d.hardware, { id: uid('hw'), role, name: mat.name, code: code.trim() || undefined, supplier: supplier.trim() || undefined, status: 'radionica', qty, materialId: mat.id }] }));
    setName(''); setCode(''); setSupplier('');
  };
  return (
    <div className="space-y-4" data-testid="gd-parts">
      <section>
        <div className="text-[12px] font-bold uppercase text-muted mb-1">Okovi</div>
        {missing.length > 0 && (
          <div className="rounded-lg border border-line bg-[#fffaeb] p-2 mb-2 text-[12.5px]" data-testid="gd-hw-missing">
            <div className="font-semibold mb-1">Uz kapiju idu, a nisu upisani (u sastavnici i listama piše „nepoznata oznaka“):</div>
            <div className="flex flex-wrap gap-1.5">
              {missing.map((r) => (
                <button key={r.role} className="btn btn-sm" data-testid={`gd-hw-missing-${r.role}`} onClick={() => setRole(r.role)}>{HW_ROLE_LABELS[r.role]} × {r.qty}</button>
              ))}
            </div>
          </div>
        )}
        <div className="rounded-lg border border-line p-2 mb-2 text-[12.5px]">
          <div className="grid sm:grid-cols-2 gap-1.5">
            <select className="input !py-1" aria-label="Uloga okova" data-testid="gd-hw-role" value={role} onChange={(e) => setRole(e.target.value as HwRole)}>
              {HW_ROLES_BY_SYS[sys].map((r) => <option key={r} value={r}>{HW_ROLE_LABELS[r]}</option>)}
            </select>
            <input className="input !py-1" placeholder="Naziv okova (obavezno)" aria-label="Naziv okova" data-testid="gd-hw-new-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
            <input className="input !py-1" placeholder="Šifra" aria-label="Šifra" value={code} onChange={(e) => setCode(e.target.value)} />
            <input className="input !py-1" placeholder="Dobavljač" aria-label="Dobavljač" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <button className="btn btn-sm" data-testid="gd-hw-add" disabled={!name.trim()} onClick={add}><Plus size={14} />Dodaj okov</button>
            <span className="text-[11.5px] text-muted">Upisuje se i u „Materijali i cene“; cenu upišite tamo.</span>
          </div>
        </div>
        {design.hardware.length === 0 && <p className="text-[12px] text-muted">Nijedan okov nije upisan.</p>}
        {design.hardware.map((h, i) => (
          <div key={h.id} className="rounded-lg border border-line p-2 mb-2 text-[12.5px]" data-testid={`gd-hw-${i}`}>
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-muted">{HW_ROLE_LABELS[h.role]}</span>
              <span className="font-semibold flex-1 min-w-[140px]" data-testid={`gd-hw-name-${i}`}>{h.name}{h.code ? ` (${h.code})` : ''}{h.supplier ? ` · ${h.supplier}` : ''}</span>
              <button className="btn btn-icon !w-7 !h-7" aria-label="Ukloni okov" onClick={() => update((d) => ({ ...d, hardware: d.hardware.filter((x) => x.id !== h.id) }))}><Trash2 size={13} /></button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mt-1.5 items-end">
              <label>Kom.<NumInput value={h.qty} ariaLabel="Količina" onCommit={(v) => patchHw(h.id, { qty: v ?? 0 })} /></label>
              <label title="Najmanji zazor za koji okov radi (npr. kota B šarke)">Min zazor<NumInput value={h.minGapMm} testId={`gd-hw-min-${i}`} ariaLabel="Minimalni zazor" onCommit={(v) => patchHw(h.id, { minGapMm: num(v) })} /></label>
              <label>Max zazor<NumInput value={h.maxGapMm} ariaLabel="Maksimalni zazor" onCommit={(v) => patchHw(h.id, { maxGapMm: num(v) })} /></label>
              <label title="Zazor koji se predlaže u merama">Nominala<NumInput value={h.nominalGapMm} ariaLabel="Nominala" onCommit={(v) => patchHw(h.id, { nominalGapMm: num(v) })} /></label>
              <label>Max krilo<NumInput value={h.maxLeafWidthMm} ariaLabel="Najveća širina krila" onCommit={(v) => patchHw(h.id, { maxLeafWidthMm: num(v) })} /></label>
              <label>Masa kg<NumInput value={h.kg} ariaLabel="Masa komada" onCommit={(v) => patchHw(h.id, { kg: num(v) })} /></label>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

/* ---------- Sastavnica ---------- */
function ProductionTab({ project, index, g, materials, clearStart, clearEnd }: { project: Project; index: number; g: Gate; materials: Material[]; clearStart: number; clearEnd: number }) {
  const layout = computeLayout(project);
  const li = layout.items[index];
  const infill = useMemo(() => {
    const vars = specVars({ modelId: g.infillModelId, slopeFactor: 1, widthMm: gateSpecWidth(g, li.clearWidth), heightMm: g.heightMm, axisMm: li.axisEnd - li.axisStart, params: g.params, doubleGate: g.gateType === 'double', leafWidthsMm: g.gateType === 'double' ? gateLeafPoses(g, clearStart, clearEnd, 1).map((q) => q.widthMm) : undefined });
    // isti materijal u više delova specifikacije sabira se u jedan red; redovi bez količine se ne prikazuju
    const acc = new Map<string, { name: string; qty: number; unit: string; kgPerM?: number; meters: number }>();
    for (const ev of evaluateSpec(specFor(g.infillModelId, useAppStore.getState().settings.modelSpecs), vars)) {
      if (!(ev.materialQty > 1e-6)) continue;
      const m = materials.find((x) => x.id === ev.part.materialId);
      const key = m?.id ?? ev.part.name;
      const cur = acc.get(key) ?? { name: m?.name ?? ev.part.name, qty: 0, unit: m?.unit ?? 'kom', kgPerM: m?.kgPerM, meters: 0 };
      cur.qty += ev.materialQty;
      if (m?.unit === 'm') cur.meters += ev.materialQty;
      acc.set(key, cur);
    }
    return [...acc.values()];
  }, [g, li, materials, clearStart, clearEnd]);
  const bom = gateBomLines(g, li.clearWidth, materials);
  return (
    <div className="space-y-4 text-[12.5px]" data-testid="gd-production">
      <section>
        <div className="text-[12px] font-bold uppercase text-muted mb-1">Sastavnica kapije</div>
        <table className="w-full text-left" data-testid="gd-bom">
          <tbody>
            {infill.map((f, i) => <tr key={`i${i}`} className="border-t border-line"><td className="py-0.5">Ispuna: {f.name}</td><td className="text-right">{f.qty.toFixed(f.unit === 'm' ? 2 : 0).replace('.', ',')} {f.unit}</td></tr>)}
            {bom.map((b, i) => { const m = materials.find((x) => x.id === b.materialId); return <tr key={`b${i}`} className="border-t border-line" data-testid="gd-bom-line"><td className="py-0.5">{b.group}: {m?.name ?? b.label}{!m && <span className="text-muted"> (bez cene)</span>}</td><td className="text-right">{b.materialId.startsWith('gate-m:') || m?.unit === 'm' ? `${b.qty.toFixed(2).replace('.', ',')} m` : `${b.qty} kom`}</td></tr>; })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
