import { PartsPanel } from './PartsPanel';
import { allFenceModels } from '../../domain/models/customRegistry';
import { AlertTriangle, ArrowLeft, ArrowRight, Copy, Trash2, Calculator, FileDown, Scissors, ClipboardList, Ruler } from 'lucide-react';
import { useMemo, useState } from 'react';
import { autoFillToFixedTotal, changeColor, changeFinish, isTotalLocked, setItemWidthLock, setTotalLock, indexOfItem, resetPostHeights, setAllColors, setAllFinishes, setAllGatesOwnPosts, setAllPlinths, removeItemPlinths, setItemPlinthHeight, setRl10Params, resetRl10Params, setTubesParams, resetTubesParams, setPlinthWidth, setAllHeights, setOuterWidth, updateItem, updatePost } from '../../domain/geometry/operations';
import { computeInfill } from '../../domain/geometry/infill';
import { MAX_TURN_DEG } from '../../domain/geometry/plan';
import { cornerInfo } from '../../domain/geometry/corner';
import { computeLayout, isSpacer, outerWidthMm, postHalfSum, totalStatus } from '../../domain/geometry/layout';
import {
  AUTOMATION_LABELS, FENCE_MODELS, HINGE_LABELS, LOCK_LABELS, MOUNTING_LABELS, POST_LABELS, POST_SIZES, isTerraceModel, maxRods, rodCountFor,
} from '../../domain/models/catalog';
import { MAX_FIELDS, STAIR_DEFAULT_RISE_MM, STAIR_MAX_DEG, STAIR_MIN_DEG, recommendedStairPosts, slopeOf, stairGroupAt } from '../../domain/geometry/stair';
import { clearStair, makeStair, setStairGroup, stairOuterRunMm, type StairPatch } from '../../domain/geometry/stairOps';
import { OWN_POSTS_GAP_MM } from '../../domain/models/factories';
import { PLINTH_DEFAULT_MM, type FenceModelId, type FenceParams, type Gate, type LayoutItem, type Project } from '../../domain/models/types';
import { RL10_LABELS, RL10_LIMITS, isRl10Model, rl10Dims, type Rl10Dims } from '../../domain/models/rl10';
import { TUBES_LABELS, TUBES_LIMITS, isTubesModel, tubesDims, type TubesDims } from '../../domain/models/tubes';
import { CAP_LABELS, catalogPostSize, isTarabicaPost, maxArchMm, postCaps, TARABICA, TOP_CAPS, tarabicaClearWidth, tarabicaLayout } from '../../domain/models/tarabica';
import { computePrice } from '../../domain/pricing/calc';
import { LIMITS, heightRangeFor, widthRangeFor } from '../../domain/validation/limits';
import { useAppStore } from '../../store/useAppStore';
import { itemLabel } from '../../utils/labels';
import { fmtMm, fmtMoney, fmtNum } from '../../utils/units';
import { ColorField, NumberField, SegmentedField, SelectField, TextField, ToggleField } from '../forms/Fields';
import { ConfirmDialog } from '../ui/Modal';
import { PdfPreviewModal } from './PdfPreviewModal';
import { GateDesignModal } from '../gates/GateDesignModal';
import { resolveGate, SYSTEM_LABELS } from '../../domain/gates/design';

function Section({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="card p-4" data-testid={testId}>
      <h3 className="font-bold text-[15px] mb-1.5">{title}</h3>
      {children}
    </section>
  );
}

function Banner({ tone, children }: { tone: 'red' | 'amber' | 'blue'; children: React.ReactNode }) {
  const c = { red: 'bg-[#fef3f2] text-[#b42318] border-[#fecdca]', amber: 'bg-[#fffaeb] text-[#93370d] border-[#fedf89]', blue: 'bg-primary-50 text-primary-600 border-red-200' }[tone];
  return <div role={tone === 'red' ? 'alert' : 'status'} className={`flex gap-2 items-start text-[13px] rounded-lg border px-3 py-2 my-2 ${c}`}><AlertTriangle size={15} className="mt-0.5 shrink-0" /><div>{children}</div></div>;
}

/** Dubina i zidovi kvadratne cevi i U profila (važe za sva polja i kapije modela uskih letvica); visina cevi, razmak i širina U su gore. */
function TubesParts({ params }: { params: FenceParams }) {
  const [open, setOpen] = useState(false);
  const d = tubesDims(params);
  const { mutate } = useAppStore.getState();
  const keys = Object.keys(TUBES_LABELS) as (keyof TubesDims)[];
  return (
    <div className="mt-2 rounded-lg border border-line" data-testid="tubes-parts">
      <button className="w-full flex items-center justify-between px-3 py-2 text-[13.5px] font-semibold" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="tubes-parts-toggle">
        Dimenzije cevi i U profila<span className="text-muted text-[12px] font-normal">{open ? 'Sakrij' : 'Prikaži'}</span>
      </button>
      {open && (
        <div className="px-3 pb-2">
          <p className="text-[12px] text-muted mb-1">Kvadratna cev 30 × 20 × 1 u U profilima 20 × 20 × 1,35 (mere radnika). Zidovi i zazor su usvojeni; važe za sva polja i kapije ovog modela.</p>
          {keys.map((k) => (
            <NumberField key={k} label={TUBES_LABELS[k]} testId={`tubes-${k}`} value={d[k]} range={TUBES_LIMITS[k]} integer={k === 'tubeDepthMm' || k === 'uDepthMm'} step={k === 'uWallMm' || k === 'tubeWallMm' || k === 'endClearMm' ? 0.05 : 1}
              onCommit={(v) => mutate((p) => setTubesParams(p, { hn: { [k]: v } }), `hn-${k}`)} />
          ))}
          <button className="btn btn-sm mt-1" data-testid="tubes-reset" onClick={() => mutate((p) => resetTubesParams(p))}>Vrati podrazumevane mere</button>
        </div>
      )}
    </div>
  );
}

/** Mere delova sistema RL10 (važe za celu ogradu): rukohvat, stub, veza, prsten, stopa, nosači i prečke. */
function Rl10Parts({ params }: { params: FenceParams }) {
  const [open, setOpen] = useState(false);
  const d = rl10Dims(params);
  const { mutate } = useAppStore.getState();
  const keys = Object.keys(RL10_LABELS) as (keyof Rl10Dims)[];
  return (
    <div className="mt-2 rounded-lg border border-line" data-testid="rl10-parts">
      <button className="w-full flex items-center justify-between px-3 py-2 text-[13.5px] font-semibold" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="rl10-parts-toggle">
        Delovi sistema RL10 (mere)<span className="text-muted text-[12px] font-normal">{open ? 'Sakrij' : 'Prikaži'}</span>
      </button>
      {open && (
        <div className="px-3 pb-2">
          <p className="text-[12px] text-muted mb-1">Mere važe za celu ogradu. Šifre su iz kataloga BTS (RL10); mere su planerske i mogu se prilagoditi.</p>
          {keys.map((k) => (
            <NumberField key={k} label={RL10_LABELS[k]} testId={`rl10-${k}`} value={d[k]} range={RL10_LIMITS[k]} onCommit={(v) => mutate((p) => setRl10Params(p, { rl10: { [k]: v } }), `rl10-${k}`)} />
          ))}
          <button className="btn btn-sm mt-1" data-testid="rl10-reset" onClick={() => mutate((p) => resetRl10Params(p))}>Vrati podrazumevane mere</button>
        </div>
      )}
    </div>
  );
}

/* ---------- Osnovne karakteristike projekta ---------- */
function ProjectBasics({ project }: { project: Project }) {
  const { mutate, setNotice } = useAppStore.getState();
  const notice = useAppStore((s) => s.editor.notice);
  const layout = computeLayout(project);
  const status = totalStatus(project);
  const s = project.settings;
  const advanced = useAppStore((st) => Boolean(st.settings.advancedLengths));
  const [confirmClear, setConfirmClear] = useState(false);
  const firstHeight = project.items[0]?.heightMm ?? s.defaultHeightMm;

  const doFill = () => {
    const res = autoFillToFixedTotal(project);
    mutate(() => res.project);
    setNotice(res.reason ?? (res.appliedMm !== 0 ? `Raspoređeno ${fmtMm(Math.abs(res.appliedMm))} između segmenata ograde (kapije nisu menjane).` : null));
  };

  return (
    <Section title="Osnovne karakteristike" testId="panel-basics">
      <TextField label="Naziv projekta" value={project.name} testId="project-name" onChange={(v) => mutate((p) => ({ ...p, name: v, updatedAt: new Date().toISOString() }), 'name')} />
 {!advanced && (
        <ToggleField label="Ukupna dužina" testId="lock-total-toggle" checked={isTotalLocked(project)} onLabel="Zaključana" offLabel="Slobodna" onChange={(v) => mutate((p) => setTotalLock(p, v))} />
      )}
      {advanced && (
        <>
      <SegmentedField label="Ukupna dužina" testId="total-mode" value={s.totalMode} options={[{ value: 'auto', label: 'Automatska' }, { value: 'fixed', label: 'Fiksna' }]}
        onChange={(v) => mutate((p) => ({ ...p, settings: { ...p.settings, totalMode: v, fixedTotalMm: v === 'fixed' && p.settings.totalMode === 'auto' ? layout.totalModularMm || p.settings.fixedTotalMm : p.settings.fixedTotalMm } }))} />
      {s.totalMode === 'fixed' ? (
        <>
          <NumberField label="Zadata dužina" testId="fixed-total" value={s.fixedTotalMm} range={LIMITS.fixedTotal} onCommit={(v) => mutate((p) => ({ ...p, settings: { ...p.settings, fixedTotalMm: v } }), 'fixed')} />
          {status.state === 'over' && <Banner tone="red"><b>Prekoračenje za {fmtMm(status.diffMm)}.</b> Elementi ({fmtMm(layout.totalModularMm)}) premašuju zadatu dužinu ({fmtMm(s.fixedTotalMm)}). Smanjite elemente ili ih rasporedite automatski.</Banner>}
          {status.state === 'under' && <Banner tone="amber">Slobodan prostor: <b>{fmtMm(status.diffMm)}</b> do zadate dužine. Možete ga ostaviti ili automatski rasporediti.</Banner>}
          {status.state === 'ok' && <Banner tone="blue">Raspored tačno popunjava zadatu dužinu.</Banner>}
          <SelectField label="Raspodela" value={s.fillStrategy} testId="fill-strategy" options={[{ value: 'proportional', label: 'Proporcionalno širini' }, { value: 'even', label: 'Ravnomerno' }]} onChange={(v) => mutate((p) => ({ ...p, settings: { ...p.settings, fillStrategy: v } }))} />
          <div className="flex gap-2 mt-1">
            <button className="btn btn-sm btn-primary flex-1" data-testid="btn-autofill" disabled={status.state === 'ok'} onClick={doFill}>Automatski rasporedi</button>
            <button className="btn btn-sm flex-1" data-testid="btn-leave-free" disabled={status.state !== 'under'} onClick={() => setNotice(`Ostavljen slobodan prostor od ${fmtMm((status as { diffMm: number }).diffMm)}.`)}>Ostavi slobodan prostor</button>
          </div>
        </>
      ) : null}
        </>
      )}
      {notice && <Banner tone={notice.startsWith('Nije') ? 'red' : 'blue'}>{notice}</Banner>}

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[13px] my-2 py-2 border-y border-line" data-testid="length-summary">
        <span className="text-muted">Ukupna dužina</span><b className="text-right tabular-nums" data-testid="total-length">{fmtMm(layout.occupiedMm)}</b>
        {advanced && (
          <>
            <span className="text-muted">Modularna dužina (osa–osa)</span><b className="text-right tabular-nums" data-testid="total-modular">{fmtMm(layout.totalModularMm)}</b>
            <span className="text-muted">Zbir svetlih otvora</span><b className="text-right tabular-nums">{fmtMm(layout.totalClearMm)}</b>
          </>
        )}
        <span className="text-muted">Broj polja</span><b className="text-right" data-testid="count-items">{project.items.filter((i) => !isSpacer(i)).length}</b>
        <span className="text-muted">Stubova (zajedničkih)</span><b className="text-right" data-testid="count-posts">{layout.postCount} ({layout.sharedPostCount})</b>
      </div>

      <NumberField label="Visina (svi)" value={firstHeight} range={LIMITS.fenceHeight} testId="all-height" onCommit={(v) => mutate((p) => setAllHeights(p, v), 'allh')} />
      <ColorField label="Boja (sve)" value={s.defaultColor} testId="all-color" onChange={(c) => mutate((p) => setAllColors(p, c))} finish={s.defaultFinish} onFinishChange={(f) => mutate((p) => setAllFinishes(p, f))} />
      {project.items.some((i) => i.kind === 'fence') && (
        <ToggleField label="Podnožje ograda" testId="field-all-plinth" checked={layout.items.every((l) => l.item.kind !== 'fence' || l.plinthMm > 0)} onLabel="Sve ograde na podnožju" offLabel="Bez podnožja" onChange={(v) => mutate((p) => setAllPlinths(p, v))} />
      )}
      {project.items.some((i) => i.kind === 'gate') && (
        <ToggleField label="Stubovi kapija" testId="field-all-gates-own-posts" checked={project.items.every((i) => i.kind !== 'gate' || Boolean(i.ownPosts))} onLabel="Sve kapije svoje stubove" offLabel="Zajednički stubovi" onChange={(v) => mutate((p) => setAllGatesOwnPosts(p, v))} />
      )}
      <button className="btn btn-sm btn-danger mt-2" disabled={project.items.length === 0} data-testid="btn-clear" onClick={() => setConfirmClear(true)}><Trash2 size={14} />Obriši sve elemente</button>
      {confirmClear && <ConfirmDialog title="Brisanje svih elemenata" danger confirmLabel="Obriši sve" message={`Biće obrisano svih ${project.items.length} elemenata. Radnju možete poništiti sa Ctrl+Z.`} onCancel={() => setConfirmClear(false)} onConfirm={() => { mutate((p) => ({ ...p, items: [], posts: [], updatedAt: new Date().toISOString() })); setConfirmClear(false); }} />}
    </Section>
  );
}

/* ---------- Model (padajući meni; menja se za sve elemente) ---------- */
function ModelSelect({ value, onChange }: { value: FenceModelId; onChange: (m: FenceModelId) => void }) {
  return (
    <SelectField stacked label="Model (menja se na svim elementima)" testId="field-model" value={value} options={allFenceModels(value).map((m) => ({ value: m.id, label: m.name }))} onChange={onChange} />
  );
}

/* ---------- Izabrani element ---------- */
/** Razmak tarabica od poda (ograda i kapija). */
function LiftField({ id, value }: { id: string; value: number }) {
  return (
    <NumberField label="Razmak od poda" testId="field-lift" value={value} range={{ min: 0, max: TARABICA.maxLiftMm }} onCommit={(v) => useAppStore.getState().patchItemParams(id, { liftMm: v }, 'lift')}
      hint="Tarabice su podignute od poda (podrazumevano koliko je visina čepa)" />
  );
}

/** Luk gornje ivice tarabica: za toliko su tarabice uz krajeve niže od najviše (u sredini); 0 = ravna ivica. */
function ArchField({ id, heightMm, value }: { id: string; heightMm: number; value: number }) {
  const max = maxArchMm(heightMm);
  return (
    <NumberField label="Luk gornje ivice" testId="field-arch" value={Math.min(value, max)} range={{ min: 0, max }} onCommit={(v) => useAppStore.getState().patchItemParams(id, { archMm: v }, 'arch')}
      hint="Razlika visine između najviše (srednje) i najniže tarabice. 0 = ravna ivica. Kod dvokrilne kapije svako krilo je polovina luka." />
  );
}

/** ulaz u mere kapije: kratko stanje (kote koje nedostaju, greške) i dugme koje otvara prozor „Mere kapije“ */
function GateDesignEntry({ project, gate }: { project: Project; gate: Gate }) {
  const [open, setOpen] = useState(false);
  const index = indexOfItem(project, gate.id);
  const li = computeLayout(project).items[index];
  const res = gate.design ? resolveGate(gate, li.clearWidth) : null;
  const errors = res?.issues.filter((i) => i.level === 'error').length ?? 0;
  return (
    <div className="rounded-lg border border-line p-2.5 mb-2" data-testid="gate-design-entry">
      <div className="text-[12.5px] text-muted mb-1.5">
        {res ? <>Mere kapije: {SYSTEM_LABELS[res.system]}{gate.design?.template ? ` · šablon „${gate.design.template.name}“ v${gate.design.template.version}` : ''}{errors ? <span className="text-[#b42318]"> · {errors} grešaka</span> : ''}</> : 'Zazori, krila, rep, kolica, okovi i šabloni kapije zadaju se u merama kapije.'}
      </div>
      <button className="btn btn-sm btn-primary w-full" data-testid="btn-gate-design" onClick={() => setOpen(true)}><Ruler size={14} />Mere kapije</button>
      {open && <GateDesignModal projectId={project.id} itemId={gate.id} onClose={() => setOpen(false)} />}
    </div>
  );
}

function ItemPanel({ project, id }: { project: Project; id: string }) {
  const st = useAppStore.getState();
  const index = indexOfItem(project, id);
  const it = project.items[index];
  const layout = useMemo(() => computeLayout(project), [project]);
  if (!it) return null;
  const li = layout.items[index];
  const label = itemLabel(project.items, index);
  const wRange = widthRangeFor(it);
  const half = postHalfSum(project, index);

  const stairIn = stairGroupAt(project.items, index) !== null;
  const common = (
    <>
      {!stairIn && <NumberField label="Širina" testId="field-width" value={Math.round(outerWidthMm(project, index))} range={{ min: Math.round(wRange.min + half), max: Math.round(wRange.max + half) }} onCommit={(v) => st.setWidth(id, v, `w:${id}`)}
        hint={isTotalLocked(project) ? 'Ukupna dužina je zaključana: ostala platna se prilagođavaju da zbir ostane isti.' : undefined} />}
      {!stairIn && it.kind === 'fence' && (
        <ToggleField label="Širina platna" testId="field-width-lock" checked={Boolean(it.widthLocked)} onLabel="Zaključana" offLabel="Slobodna" onChange={(v) => st.mutate((p) => setItemWidthLock(p, id, v))} />
      )}
      <NumberField label="Visina" testId="field-height" value={it.heightMm} range={heightRangeFor(it)} onCommit={(v) => (stairIn ? st.mutate((p) => setStairGroup(p, id, { heightMm: v }), `h:${id}`) : st.patchItem(id, { heightMm: v }, 'h'))} />
    </>
  );

  let body: React.ReactNode;
  if (it.kind === 'opening' && it.bendDeg !== undefined) {
    const info = cornerInfo(project, index);
    body = (
      <>
        <NumberField label="Ugao savijanja" testId="field-bend" unit="°" step={5} value={it.bendDeg} range={{ min: -MAX_TURN_DEG, max: MAX_TURN_DEG }}
          onCommit={(v) => st.patchItem(id, { bendDeg: v === 0 ? 5 : v }, 'bend')} />
        <div className="flex gap-1.5 pb-1.5 flex-wrap">
          {[-90, -45, 45, 90].map((a) => <button key={a} className={`btn btn-sm ${it.bendDeg === a ? 'btn-primary' : ''}`} data-testid={`bend-${a}`} onClick={() => st.patchItem(id, { bendDeg: a })}>{a > 0 ? '+' : ''}{a}°</button>)}
        </div>
        <NumberField label="Razmak za savijanje" testId="field-width" value={it.widthMm} range={wRange} onCommit={(v) => st.patchItem(id, { widthMm: v }, 'w')} />
        {!info && <Banner tone="amber">Uz ugaoni spoj treba da stoji ograda sa prečkama (npr. „Srebrni stubovi — crne prečke"); inače nema šta da se savije.</Banner>}
      </>
    );
  } else if (it.kind === 'opening') {
    body = common;
  } else if (it.kind === 'fence') {
    const def = FENCE_MODELS[it.modelId];
    const count = computeInfill(it.modelId, li.clearWidth, it.heightMm, it.params.frameMm, it.params.barSizeMm, it.params.gapMm, it.params.barCount, it.params.liftMm, undefined, it.params.archMm).bars.filter((b: { tone: string }) => b.tone === 'main').length;
    const tl = def.style === 'tarabica' ? tarabicaLayout(li.clearWidth, it.heightMm, it.params.barSizeMm, it.params.gapMm, it.params.frameMm) : null;
    const slatCountRange = (() => {
      const per = it.params.barSizeMm + it.params.gapMm;
      const fit = (outer: number) => (outer - 2 * half - 2 * it.params.frameMm + it.params.gapMm) / per;
      return { min: Math.max(1, Math.ceil(fit(wRange.min + half) - 1e-9)), max: Math.max(1, Math.floor(fit(wRange.max + half) + 1e-9)) };
    })();
    body = (
      <>
        {common}
        <ModelSelect value={it.modelId} onChange={(m) => st.setItemModel(id, m)} />
        <ColorField stacked value={it.color} testId="field-color" onChange={(c) => st.setItemColor(id, c)} finish={it.finish} onFinishChange={(f) => st.setItemFinish(id, f)} />
        {def.hasBars && (
          <>
            <NumberField label={def.barLabel} testId="field-bar" value={it.params.barSizeMm} range={isRl10Model(it.modelId) ? { min: 8, max: 40 } : LIMITS.barSize}
              onCommit={(v) => (isRl10Model(it.modelId) ? st.mutate((p) => setRl10Params(p, { barSizeMm: v }), 'rl10-bar') : st.patchItemParams(id, { barSizeMm: v }, 'bar'))} />
            {tl && (
              <NumberField label="Broj tarabica" testId="field-slat-count" unit="kom" step={1} value={tl.count} range={slatCountRange}
                onCommit={(n) => st.mutate((p) => setOuterWidth(p, id, tarabicaClearWidth(n, it.params.barSizeMm, it.params.gapMm, it.params.frameMm) + 2 * half), `w:${id}`)}
                hint="Menja širinu polja tako da n tarabica stane sa zadatim razmakom i prepustom" />
            )}
            {def.rods ? (
              <NumberField label="Broj prečki" testId="field-rods" unit="kom" step={1} value={rodCountFor(it.modelId, it.params, it.heightMm) ?? def.rods.default}
                range={{ min: def.rods.min, max: maxRods(it.modelId, it.heightMm) }} onCommit={(v) => st.patchItemParams(id, { barCount: v }, 'rods')}
                hint={`Razmak ${Math.round((it.heightMm - 200) / (rodCountFor(it.modelId, it.params, it.heightMm) ?? def.rods.default))} mm`} />
            ) : (
              <NumberField label={def.gapLabel} testId="field-gap" value={it.params.gapMm} range={LIMITS.gap} onCommit={(v) => st.patchItemParams(id, { gapMm: v }, 'gap')} hint={tl ? `Tarabica: ${count}, stvarni razmak ${fmtNum(tl.gapMm, 1)} mm` : `Profila: ${count}`} />
            )}
          </>
        )}
        {def.style !== 'rods' && def.style !== 'glass_rail' && def.style !== 'custom' && (
          <NumberField label={def.frameLabel ?? 'Debljina rama'} testId={def.style === 'tarabica' ? 'field-overhang' : undefined} value={it.params.frameMm}
            range={def.style === 'tarabica' ? { min: 0, max: TARABICA.maxOverhangMm } : LIMITS.frame} onCommit={(v) => st.patchItemParams(id, { frameMm: v }, 'frame')}
            hint={def.style === 'tarabica' ? 'Koliko cev 30×30 viri iza krajnje tarabice sa svake strane' : undefined} />
        )}
        <ToggleField label="Betonsko podnožje" testId="field-item-plinth-on" checked={li.plinthMm > 0} onLabel="Sa podnožjem" offLabel="Bez podnožja" onChange={(v) => (v ? st.patchItem(id, { plinthMm: PLINTH_DEFAULT_MM }) : st.mutate((p) => removeItemPlinths(p, [id])))} />
        {li.plinthMm > 0 && (
          <NumberField label="Visina podnožja" testId="field-item-plinth" value={li.plinthMm} range={{ min: 50, max: 1200 }} onCommit={(v) => st.mutate((p) => setItemPlinthHeight(p, id, v), `plinth:${id}`)}
            hint="Ograda i stubovi stoje na podnožju" />
        )}
        {li.plinthMm > 0 && (
          <NumberField label="Širina podnožja" testId="field-item-plinth-width" value={Math.round(li.plinthX1 - li.plinthX0)} range={{ min: 100, max: Math.round(wRange.max + half) }}
            onCommit={(v) => st.mutate((p) => setPlinthWidth(p, id, v), `plinthw:${id}`)}
            hint={it.plinthWidthMm ? 'Kraće od polja: centrirano ispod njega' : 'Podrazumevano: ispod polja i stubova. Šire podnožje širi i ogradu (susedni elementi se pomeraju).'} />
        )}
        {isRl10Model(it.modelId) && <Rl10Parts params={it.params} />}
        {isTubesModel(it.modelId) && <TubesParts params={it.params} />}
        <PartsPanel project={project} params={it.params} />
        {isTerraceModel(it.modelId) && (() => {
          // stepenište: niz polja između stubova; prvi i poslednji stub su na krajevima, stubovi između se dodaju (preporuka: na svaki metar)
          const grp = stairGroupAt(project.items, index);
          const on = grp !== null;
          const rise = grp?.riseMm ?? 0;
          const outerRun = grp ? stairOuterRunMm(project, id) : 0;
          const sl = grp ? slopeOf(grp.runMm, grp.riseMm) : null;
          const fields = grp ? grp.to - grp.from + 1 : 1;
          const mutateStair = (patch: StairPatch, key: string) => st.mutate((p) => setStairGroup(p, id, patch), `${key}:${id}`);
          return (
            <>
              <ToggleField label="Stepenište" testId="field-stair-on" checked={on} onLabel="Prati stepenice" offLabel="Ravna ograda"
                onChange={(v) => st.mutate((p) => (v ? makeStair(p, id, index > 0 ? -STAIR_DEFAULT_RISE_MM : STAIR_DEFAULT_RISE_MM) : clearStair(p, id)))} />
              {grp && sl && (
                <>
                  <SegmentedField label="Smer (gledano s leva nadesno)" testId="field-stair-dir" value={rise > 0 ? 'up' : 'down'} options={[{ value: 'up', label: 'Penje se' }, { value: 'down', label: 'Silazi' }]}
                    onChange={(v) => mutateStair({ riseMm: (v === 'up' ? 1 : -1) * Math.abs(rise) }, 'stair-dir')} />
                  <NumberField label="Dužina stepeništa" testId="field-stair-run" value={Math.round(outerRun)} range={{ min: 500, max: 20000 }}
                    onCommit={(v) => mutateStair({ outerRunMm: v }, 'stair-run')}
                    hint="Ukupno, od spoljne ivice prvog do spoljne ivice poslednjeg stuba" />
                  <NumberField label="Visinska razlika" testId="field-stair-rise" value={Math.abs(Math.round(rise))} range={{ min: 50, max: 6000 }}
                    onCommit={(v) => mutateStair({ riseMm: Math.sign(rise || 1) * v }, 'stair-rise')}
                    hint={`Nagib ${fmtNum(sl.deg, 1)}° · kosa dužina ${fmtMm(Math.round(grp.runMm * sl.factor))}`} />
                  <NumberField label="Broj stepenika" testId="field-stair-steps" unit="kom" step={1} value={grp.steps} range={{ min: 1, max: 80 }}
                    onCommit={(v) => mutateStair({ steps: v }, 'stair-steps')}
                    hint={`Stepenik ${fmtNum(Math.abs(rise) / grp.steps, 0)} mm visine i ${fmtNum(grp.runMm / grp.steps, 0)} mm gazišta`} />
                  <NumberField label="Broj stubova" testId="field-stair-posts" unit="kom" step={1} value={fields + 1} range={{ min: 2, max: Math.min(MAX_FIELDS, grp.steps + 1) + 1 }}
                    onCommit={(v) => mutateStair({ fields: v - 1 }, 'stair-posts')}
                    hint={`Prvi i poslednji stub su na krajevima, ostali po sredini stepenika. Preporuka: na svaki treći stepenik (${recommendedStairPosts(grp.steps) + 2} stubova)${grp.fieldsCustom ? '' : ' — izabrano automatski'}`} />
                  {/* skretanje ograde u osnovi na kraju i na početku stepeništa: ugao se zadaje na zglobu, a stub je pored njega */}
                  {([['end', grp.to + 1, 'Skretanje ograde na kraju stepeništa'], ['start', grp.from, 'Skretanje ograde na početku stepeništa']] as const)
                    .filter(([, pi]) => pi > 0 && pi < project.items.length)
                    .map(([which, pi, label]) => {
                      const post = project.posts[pi];
                      const turn = post?.turnDeg ?? 0;
                      return (
                        <div key={which} data-testid={`stair-turn-${which}`}>
                          <NumberField label={label} testId={`field-stair-turn-${which}`} unit="°" step={5} value={turn} range={{ min: -MAX_TURN_DEG, max: MAX_TURN_DEG }}
                            onCommit={(v) => st.patchPost(post.id, { turnDeg: v }, 'turn')}
                            hint={which === 'end' ? 'Ograda posle stepeništa skreće u stranu: rukohvat ima pravo parče između dve kugle, a prečke kolena' : 'Ugao u osnovi na zglobu na početku stepeništa'} />
                          <div className="flex gap-1.5 pb-1.5 flex-wrap">
                            {[-90, -45, 0, 45, 90].map((a) => <button key={a} className={`btn btn-sm ${turn === a ? 'btn-primary' : ''}`} data-testid={`stair-turn-${which}-${a}`} onClick={() => st.patchPost(post.id, { turnDeg: a })}>{a === 0 ? 'Ravno' : `${a > 0 ? '+' : ''}${a}°`}</button>)}
                          </div>
                        </div>
                      );
                    })}
                  {(sl.deg < STAIR_MIN_DEG || sl.deg > STAIR_MAX_DEG) && (
                    <Banner tone="amber">Nagib {fmtNum(sl.deg, 1)}° je neuobičajen za stepenište (obično {STAIR_MIN_DEG}–{STAIR_MAX_DEG}°): proverite dužinu i visinsku razliku.</Banner>
                  )}
                </>
              )}
            </>
          );
        })()}
        {def.style === 'tarabica' && <LiftField id={id} value={it.params.liftMm ?? TARABICA.defaultLiftMm} />}
        {def.style === 'tarabica' && <ArchField id={id} heightMm={it.heightMm} value={it.params.archMm ?? 0} />}
      </>
    );
  } else {
    const g: Gate = it;
    const swing = g.gateType !== 'sliding';
    body = (
      <>
        <GateDesignEntry project={project} gate={g} />
        {common}
        <ModelSelect value={g.infillModelId} onChange={(m) => st.setItemModel(id, m)} />
        <ColorField stacked value={g.color} testId="field-color" onChange={(c) => st.setItemColor(id, c)} finish={g.finish} onFinishChange={(f) => st.setItemFinish(id, f)} />
        <ToggleField label="Stubovi kapije" testId="field-gate-own-posts" checked={Boolean(g.ownPosts)} onLabel="Svoji stubovi" offLabel="Zajednički stub" onChange={(v) => st.patchItem(id, { ownPosts: v })} />
        {g.ownPosts && <NumberField label="Razmak stubova" testId="field-gate-post-gap" value={g.postGapMm ?? OWN_POSTS_GAP_MM} range={{ min: 0, max: 500 }} onCommit={(v) => st.patchItem(id, { postGapMm: v }, 'postgap')} hint="Razmak između stuba ograde i stuba kapije" />}
        <SegmentedField label={g.gateType === 'sliding' ? 'Smer klizanja' : 'Strana šarki'} testId="field-opening" value={g.opening} options={[{ value: 'left', label: 'Levo' }, { value: 'right', label: 'Desno' }]} onChange={(v) => st.patchItem(id, { opening: v })} />
        {swing && g.gateType !== 'double' && <></>}
        {swing && <SegmentedField label="Otvaranje" testId="field-swing" value={g.swing} options={[{ value: 'inward', label: 'Unutra' }, { value: 'outward', label: 'Spolja' }]} onChange={(v) => st.patchItem(id, { swing: v })} />}
        <SelectField label="Brava" value={g.lock} options={Object.entries(LOCK_LABELS).map(([value, label]) => ({ value: value as Gate['lock'], label }))} onChange={(v) => st.patchItem(id, { lock: v })} />
        {swing && <SelectField label="Šarke" value={g.hinge} options={Object.entries(HINGE_LABELS).map(([value, label]) => ({ value: value as Gate['hinge'], label }))} onChange={(v) => st.patchItem(id, { hinge: v })} />}
        <ToggleField label="Automatika" testId="field-automation" checked={g.automation} onLabel="Da (motor)" offLabel="Ne" onChange={(v) => st.patchItem(id, { automation: v })} />
        {g.automation && <SelectField label="Tip automatike" value={g.automationType} options={Object.entries(AUTOMATION_LABELS).map(([value, label]) => ({ value: value as Gate['automationType'], label }))} onChange={(v) => st.patchItem(id, { automationType: v })} />}
        {/* kapija sa merama: krila i bočni prostor zadaju se u „Mere kapije“ (ova stara polja bi im protivrečila) */}
        {g.design && (g.gateType === 'double' || g.gateType === 'sliding') && (
          <div className="text-[12.5px] text-muted pb-1" data-testid="gate-design-note">{g.gateType === 'double' ? 'Širine krila i zazori' : 'Rep, hod i bočni prostor'} se zadaju u „Mere kapije“.</div>
        )}
        {g.gateType === 'double' && !g.design && (
          <>
            <ToggleField label="Različita krila" checked={g.unequalLeaves} onChange={(v) => st.patchItem(id, { unequalLeaves: v, leftLeafMm: v ? Math.round((g.widthMm - 20) / 2) : 0 })} />
            {g.unequalLeaves ? (
              <NumberField label="Levo krilo" value={g.leftLeafMm} range={{ min: 500, max: Math.max(600, g.widthMm - 520) }} onCommit={(v) => st.patchItem(id, { leftLeafMm: v }, 'leaf')} hint={`Desno krilo: ${fmtMm(Math.max(0, li.clearWidth - 20 - g.leftLeafMm))}`} />
            ) : (
              <div className="text-[12.5px] text-muted pb-1">Oba krila iste širine: {fmtMm((li.clearWidth - 20) / 2)}.</div>
            )}
          </>
        )}
        {g.gateType === 'sliding' && !g.design && (
          <>
            <ToggleField label="Prostor za povlačenje" checked={g.availableSpaceMm !== undefined} onLabel="Zadat" offLabel="Nije zadat" testId="field-space-known" onChange={(v) => st.patchItem(id, { availableSpaceMm: v ? Math.round(li.clearWidth) : undefined })} />
            {g.availableSpaceMm !== undefined && (
              <NumberField label="Raspoloživ prostor" testId="field-space" value={g.availableSpaceMm} range={{ min: 100, max: 20000 }} onCommit={(v) => st.patchItem(id, { availableSpaceMm: v }, 'space')}
                hint={g.availableSpaceMm < li.clearWidth ? <span className="text-[#b42318]">Nedovoljno: za hod kapije potrebno je ≈ {fmtMm(li.clearWidth)}. Orijentaciona provera, nije sertifikovana.</span> : `Dovoljno za hod kapije od ${fmtMm(li.clearWidth)}.`} />
            )}
          </>
        )}
        <NumberField label="Debljina rama" value={g.params.frameMm} range={LIMITS.frame} onCommit={(v) => st.patchItemParams(id, { frameMm: v }, 'frame')} />
        {FENCE_MODELS[g.infillModelId].style === 'tarabica' && <LiftField id={id} value={g.params.liftMm ?? TARABICA.defaultLiftMm} />}
        {FENCE_MODELS[g.infillModelId].style === 'tarabica' && <ArchField id={id} heightMm={g.heightMm} value={g.params.archMm ?? 0} />}
        <PartsPanel project={project} params={g.params} />
      </>
    );
  }

  return (
    <Section title={`Odabran element: ${label}`} testId="panel-item">
      <div className="flex flex-wrap gap-1.5 mb-2" data-testid="item-actions">
        <button className="btn btn-sm" data-testid="btn-move-left" disabled={index === 0} onClick={() => st.moveSelected(-1)}><ArrowLeft size={14} />Pomeri levo</button>
        <button className="btn btn-sm" data-testid="btn-move-right" disabled={index === project.items.length - 1} onClick={() => st.moveSelected(1)}>Pomeri desno<ArrowRight size={14} /></button>
        <button className="btn btn-sm" data-testid="btn-duplicate" onClick={st.duplicateSelected}><Copy size={14} />Dupliraj</button>
        <button className="btn btn-sm btn-danger" data-testid="btn-delete" onClick={st.deleteSelected}><Trash2 size={14} />Obriši</button>
      </div>
      {body}
    </Section>
  );
}

/* ---------- Više izabranih polja ---------- */
function MultiPanel({ project, ids }: { project: Project; ids: string[] }) {
  const st = useAppStore.getState();
  const items = ids.map((id) => project.items.find((i) => i.id === id)).filter((i): i is LayoutItem => Boolean(i));
  if (items.length < 2) return null;
  // visina mora da važi za svako izabrano polje (presek dozvoljenih opsega)
  const ranges = items.map((i) => heightRangeFor(i));
  const range = { min: Math.max(...ranges.map((r) => r.min)), max: Math.min(...ranges.map((r) => r.max)) };
  const heights = [...new Set(items.map((i) => i.heightMm))];
  const colorable = items.filter((i) => i.kind !== 'opening');
  const colors = [...new Set(colorable.map((i) => i.color))];
  const finishes = [...new Set(colorable.map((i) => i.finish ?? ''))];
  const sorted = [...items].sort((a, b) => indexOfItem(project, a.id) - indexOfItem(project, b.id));
  return (
    <Section title={`Izabrano polja: ${items.length}`} testId="panel-multi">
      <div className="flex flex-wrap gap-1.5 mb-2" data-testid="multi-labels">
        {sorted.map((it) => <span key={it.id} className="pill !py-0.5 !px-2 !text-[12px] bg-primary-50 text-primary-600">{itemLabel(project.items, indexOfItem(project, it.id))}</span>)}
      </div>
      <NumberField label="Visina (izabrana)" testId="multi-height" value={heights[0]} range={range}
        hint={heights.length > 1 ? `Sada različite visine: ${heights.map((h) => fmtMm(h)).join(', ')}` : undefined}
        onCommit={(v) => st.mutate((p) => ids.reduce((q, id) => updateItem(q, id, { heightMm: v }), p), 'multi-h')} />
      {colorable.length > 0 && (
        <ColorField stacked label="Boja (izabrana)" testId="multi-color" value={colors.length === 1 ? colors[0] : ''} onChange={(c) => st.mutate((p) => ids.reduce((q, id) => changeColor(q, id, c), p))}
          finish={finishes.length === 1 && finishes[0] ? (finishes[0] as import('../../domain/models/types').Finish) : undefined} onFinishChange={(f) => st.mutate((p) => ids.reduce((q, id) => changeFinish(q, id, f), p))} />
      )}
      <div className="flex flex-wrap gap-1.5 mt-2">
        <button className="btn btn-sm" data-testid="multi-clear" onClick={() => st.select(null)}>Poništi izbor</button>
        <button className="btn btn-sm btn-danger" data-testid="multi-delete" onClick={st.deleteSelected}><Trash2 size={14} />Obriši izabrana</button>
      </div>
      <p className="text-[12px] text-muted mt-2">Ctrl+klik dodaje ili izbacuje polje, Shift+klik bira niz polja, a prevlačenje po pozadini crta okvir za izbor.</p>
    </Section>
  );
}

/* ---------- Izabrani stub ---------- */
/** Izmene stuba važe za sve stubove dok korisnik ne isključi prekidač; izbor se pamti dok se aplikacija ne osveži. */
let applyToAllPosts = true;

/** Tipovi stuba koji se biraju ručno (stub kapije i dekorativni stub se ne nude; stub kapije se postavlja sam uz kapiju). */
const MANUAL_POST_TYPES = ['aluminium', 'concrete', 'concrete_plinth'];
const TOP_CAP_OPTIONS = TOP_CAPS.map((value) => ({ value, label: CAP_LABELS[value] }));

function PostPanel({ project, id }: { project: Project; id: string }) {
  const [allPosts, setAllPostsState] = useState(applyToAllPosts);
  const setAllPosts = (v: boolean) => { applyToAllPosts = v; setAllPostsState(v); };
  const multiPosts = useAppStore((s) => s.editor.multiPosts);
  const st = useAppStore.getState();
  const layout = computeLayout(project);
  const lp = layout.posts.find((p) => p.post.id === id);
  if (!lp) return null;
  const p = lp.post;
  const tarabicaPost = isTarabicaPost(project.items, p, lp.index);
  // izmene važe za izabrane stubove (Ctrl+klik), za sve stubove (prekidač) ili samo za ovaj stub
  const picked = multiPosts.filter((x) => project.posts.some((q) => q.id === x));
  const targets = picked.length > 1 ? picked : allPosts ? project.posts.map((q) => q.id) : [id];
  const applyPatch = (patch: Partial<typeof p>, key?: string) => {
    if (targets.length === 1) st.patchPost(id, patch, key);
    else st.mutate((pr) => targets.reduce((q, pid) => updatePost(q, pid, patch), pr), key ? `${key}:multi` : null);
  };
  const role = lp.role === 'end' ? 'Krajnji stub' : lp.role === 'gate' ? 'Stub kapije' : 'Međustub (zajednički)';
  return (
    <Section title={picked.length > 1 ? `Izabrano stubova: ${picked.length}` : `Odabran stub: S${lp.index + 1}`} testId="panel-post">
      <div className="text-[12.5px] text-muted mb-1">{role} · pozicija {fmtMm(lp.x)} · ID {p.id.slice(-6)}</div>
      {picked.length > 1 ? (
        <div className="text-[12.5px] text-muted mb-1" data-testid="post-multi-note">Izmene važe za sve izabrane stubove. Ctrl+klik dodaje ili izbacuje stub, Shift+klik bira niz stubova.</div>
      ) : (
        <ToggleField label="Izmene važe za" testId="post-caps-all" checked={allPosts} onLabel="Sve stubove" offLabel="Samo ovaj stub" onChange={setAllPosts} />
      )}
      {lp.index > 0 && lp.index < project.items.length ? (
        <div data-testid="post-turn">
          <NumberField label="Ugao skretanja" testId="field-turn" unit="°" step={5} value={p.turnDeg ?? 0} range={{ min: -MAX_TURN_DEG, max: MAX_TURN_DEG }}
            onCommit={(v) => st.patchPost(id, { turnDeg: v }, 'turn')}
            />
          <div className="flex gap-1.5 pb-1.5 flex-wrap">
            {[-90, -45, 0, 45, 90].map((a) => <button key={a} className={`btn btn-sm ${(p.turnDeg ?? 0) === a ? 'btn-primary' : ''}`} data-testid={`turn-${a}`} onClick={() => st.patchPost(id, { turnDeg: a })}>{a === 0 ? 'Ravno' : `${a > 0 ? '+' : ''}${a}°`}</button>)}
          </div>
        </div>
      ) : null}
      <SelectField label="Tip" testId="post-type" value={p.type} options={(Object.entries(POST_LABELS) as [typeof p.type, string][]).filter(([value]) => MANUAL_POST_TYPES.includes(value) || value === p.type).map(([value, label]) => ({ value, label }))} onChange={(v) => applyPatch({ type: v })} />
      <NumberField label="Širina preseka" value={p.widthMm} range={LIMITS.postWidth} onCommit={(v) => applyPatch({ widthMm: v }, 'pw')} />
      <div className="flex gap-1.5 pb-1.5">{POST_SIZES.map((s) => <button key={s} className={`btn btn-sm ${p.widthMm === s ? 'btn-primary' : ''}`} onClick={() => applyPatch({ widthMm: s })}>{s}×{s}</button>)}</div>
      {p.type === 'concrete_plinth' && <NumberField label="Visina podnožja" testId="post-plinth" value={p.plinthMm ?? PLINTH_DEFAULT_MM} range={{ min: 100, max: 1200 }} onCommit={(v) => applyPatch({ plinthMm: v }, 'pp')} />}
      <NumberField label="Visina" value={p.heightMm} range={LIMITS.postHeight} onCommit={(v) => applyPatch({ heightMm: v }, 'ph')}
        hint={`${p.heightCustom ? 'Ručno zadata' : 'Automatska'} visina iznad podnožja ograde (ne zavisi od visine podnožja). Dužina stuba: ${fmtMm(lp.lengthMm)}${lp.baseMm > 0 ? ' (stoji na podnožju)' : ''}`} />
      {p.heightCustom && <button className="btn btn-sm mb-1.5" data-testid="post-height-auto" onClick={() => st.mutate((pr) => resetPostHeights(pr, targets))}>Vrati automatsku visinu</button>}
      {/* betonski stub ima boju betona: izbor boje menjao bi boju aluminijumskog stuba koji nije ni postavljen */}
      {!targets.every((tid) => { const t = project.posts.find((x) => x.id === tid)?.type; return t === 'concrete' || t === 'concrete_plinth'; }) && <ColorField testId="post-color" value={p.color} onChange={(c) => applyPatch({ color: c })} finish={p.finish} onFinishChange={(f) => applyPatch({ finish: f })} />}
      {tarabicaPost && (
        <div data-testid="post-caps">
          <SelectField label="Kapa na vrhu" testId="post-cap-top" value={postCaps(p).top} options={TOP_CAP_OPTIONS} onChange={(v) => applyPatch({ capTop: v })} />
          <ToggleField label="Rozetna u dnu" testId="post-cap-bottom" checked={postCaps(p).bottom === 'rosette'} onLabel="Da" offLabel="Ne" onChange={(v) => applyPatch({ capBottom: v ? 'rosette' : 'none' })} />
          <div className="text-[12px] text-muted pb-1.5" data-testid="post-cap-note">
            Stub {catalogPostSize(p.widthMm)}×{catalogPostSize(p.widthMm)} (kvadratna cev). Kape i rozetne u katalogu postoje za 80×80 i 100×100 mm{p.widthMm !== 80 && p.widthMm !== 100 ? `; za širinu ${p.widthMm} mm obračunava se najbliža veličina` : ''}.
          </div>
        </div>
      )}
      <SelectField label="Montaža" value={p.mounting} options={Object.entries(MOUNTING_LABELS).map(([value, label]) => ({ value: value as typeof p.mounting, label }))} onChange={(v) => applyPatch({ mounting: v })} />
    </Section>
  );
}

function PriceSummary({ project }: { project: Project }) {
  const materials = useAppStore((s) => s.materials);
  const specs = useAppStore((s) => s.settings.modelSpecs);
  const settings = useAppStore((s) => s.settings);
  const customers = useAppStore((s) => s.customers);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [cutOpen, setCutOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const customer = customers.find((c) => c.id === project.customerId) ?? null;
  const price = useMemo(() => computePrice(project, materials, specs), [project, materials, specs]);
  const money = (n: number) => fmtMoney(n, settings.currency, settings.currencyRateToEur);
  return (
    <>
    <Section title="Kalkulacija cene" testId="panel-price">
      <dl className="text-sm divide-y divide-line">
        <div className="flex justify-between py-1.5"><dt>Materijal</dt><dd className="tabular-nums font-semibold">{money(price.materialTotal)}</dd></div>
        <div className="flex justify-between py-1.5"><dt>Rad</dt><dd className="tabular-nums font-semibold">{money(price.laborTotal)}</dd></div>
        <div className="flex justify-between py-1.5"><dt>Montaža</dt><dd className="tabular-nums font-semibold">{money(price.installTotal)}</dd></div>
        <div className="flex justify-between py-1.5 text-[#15803d]"><dt>Popust ({project.settings.pricing.discountPercent}%)</dt><dd className="tabular-nums font-semibold">−{money(price.discountAmount)}</dd></div>
      </dl>
      <div className="mt-2 rounded-lg bg-primary-50 px-3 py-2.5 flex justify-between items-baseline">
        <span className="font-bold">Ukupno</span>
        <span className="text-right"><span className="text-[19px] font-extrabold tabular-nums" data-testid="price-total">{money(price.grossTotal)}</span><span className="block text-[11px] text-muted">sa PDV-om · ≈ {fmtNum(price.grossTotal / settings.currencyRateToEur, 0)} €</span></span>
      </div>
      <button className="btn btn-dark w-full mt-3" data-testid="btn-open-calc" onClick={() => window.dispatchEvent(new CustomEvent('open-calc'))}><Calculator size={16} />Detaljan obračun</button>
      {/* dokumenti odmah uz cenu, da se ne skroluje do dna panela */}
      <div className="grid grid-cols-3 gap-2 mt-2">
        <button className="btn !px-1 !py-2 flex-col !gap-1 text-[12.5px]" data-testid="btn-pdf" onClick={() => setPdfOpen(true)}><FileDown size={17} />PDF ponuda</button>
        <button className="btn !px-1 !py-2 flex-col !gap-1 text-[12.5px]" data-testid="btn-cutlist" onClick={() => setCutOpen(true)}><Scissors size={17} />Krojna lista</button>
        <button className="btn !px-1 !py-2 flex-col !gap-1 text-[12.5px]" data-testid="btn-workorder" onClick={() => setOrderOpen(true)}><ClipboardList size={17} />Radni nalog</button>
      </div>
    </Section>
    {pdfOpen && <PdfPreviewModal project={project} customer={customer} materials={materials} settings={settings} onClose={() => setPdfOpen(false)} />}
    {orderOpen && <PdfPreviewModal kind="workorder" project={project} customer={customer} materials={materials} settings={settings} onClose={() => setOrderOpen(false)} />}
    {cutOpen && <PdfPreviewModal kind="cutlist" askOffcuts project={project} customer={customer} materials={materials} settings={settings} onClose={() => setCutOpen(false)} />}
    </>
  );
}

export function PropertiesPanel({ project }: { project: Project }) {
  const selection = useAppStore((s) => s.editor.selection);
  const multi = useAppStore((s) => s.editor.multi);
  return (
    <div className="space-y-4" data-testid="properties">
      {selection?.type === 'item' && multi.length > 1 && <MultiPanel project={project} ids={multi} />}
      {selection?.type === 'item' && multi.length < 2 && <ItemPanel project={project} id={selection.id} />}
      {selection?.type === 'post' && <PostPanel project={project} id={selection.id} />}
      {project.items.length > 0 && <PriceSummary project={project} />}
      <ProjectBasics project={project} />
    </div>
  );
}
