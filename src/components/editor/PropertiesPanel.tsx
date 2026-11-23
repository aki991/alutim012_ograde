import { ChoiceGroup } from '../ui/ChoiceGroup';
import { GateModelPicker } from '../gates/GateModelPicker';
import { ScopeField } from '../forms/ScopeField';
import { editScopeTargets } from '../../domain/geometry/editScope';
import { IncompletePriceNotice } from './IncompletePriceNotice';
import { productionPostCount } from '../../domain/models/productionPosts';
import { GateFrameBox } from './GateFrameBox';
import { RequisitionModal } from './RequisitionModal';
import { ReinforceSettings } from './ReinforceSettings';
import { postPositions, postSpec, sharedPostMaterials, sharedPostTemplate } from '../../domain/models/terraceHardware';
import { allFenceModels, customHBarLayout, customHBarZones, customEndOverhang, customLiftOf, customModelOf, customRodInfo, customRails, customSlatLayout, isCustomModel, scaledModel } from '../../domain/models/customRegistry';
import { glassEndLimits } from '../../domain/models/glassRailing';
import { gateLeafPoses } from '../../domain/geometry/gates';
import { leafHeightOf } from '../../domain/gates/slidingLayout';
import { AlertTriangle, ArrowLeft, ArrowRight, Copy, Trash2, Calculator, FileDown, Scissors, ClipboardList, PackageCheck, Ruler } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { autoFillToFixedTotal, changeColor, changeFinish, isTotalLocked, setItemWidthLock, setTotalLock, indexOfItem, resetPostHeights, restoreBasePosts, setAllColors, setAllFinishes, setGatesOwnPosts, setAllPlinths, removeItemPlinths, setItemPlinthHeight, setRl10Params, resetRl10Params, setTubesParams, resetTubesParams, setPlinthWidth, setAllHeights, updateItem, updatePost } from '../../domain/geometry/operations';
import { computeInfill } from '../../domain/geometry/infill';
import { MAX_TURN_DEG } from '../../domain/geometry/plan';
import { cornerInfo } from '../../domain/geometry/corner';
import { computeLayout, isSpacer, outerWidthMm, postHalfSum, totalStatus } from '../../domain/geometry/layout';
import {
  AUTOMATION_LABELS, FENCE_MODELS, HINGE_LABELS, LOCK_LABELS, MOUNTING_LABELS, POST_LABELS, POST_SIZES, fenceModelOfGate, isTerraceModel, maxRods, projectModelId, rodCountFor,
} from '../../domain/models/catalog';
import { MAX_FIELDS, STAIR_DEFAULT_RISE_MM, STAIR_MAX_DEG, STAIR_MIN_DEG, recommendedStairPosts, slopeOf, stairGroupAt } from '../../domain/geometry/stair';
import { clearStair, makeStair, setStairGroup, stairOuterRunMm, type StairPatch } from '../../domain/geometry/stairOps';
import { OWN_POSTS_GAP_MM } from '../../domain/models/factories';
import { PLINTH_DEFAULT_MM, type FenceModelId, type FenceSection, type FenceParams, type Gate, type LayoutItem, type Material, type Post, type Project } from '../../domain/models/types';
import { RL10_LABELS, RL10_LIMITS, isRl10Model, rl10Dims, type Rl10Dims } from '../../domain/models/rl10';
import { TUBES_LABELS, TUBES_LIMITS, isTubesModel, tubesDims, type TubesDims } from '../../domain/models/tubes';
import { computePrice } from '../../domain/pricing/calc';
import { LIMITS, heightRangeFor, widthRangeFor } from '../../domain/validation/limits';
import { useAppStore } from '../../store/useAppStore';
import { itemLabel } from '../../utils/labels';
import { fmtMm, fmtMoney, fmtNum } from '../../utils/units';
import { ColorField, NumberField, SegmentedField, SelectField, TextField, ToggleField } from '../forms/Fields';
import { ConfirmDialog } from '../ui/Modal';
import { PdfPreviewModal } from './PdfPreviewModal';
import { capOptions, capPatch, defaultPostMaterial, templateFromPost, type CapSlot } from '../../domain/models/postTemplates';
import { MaterialSelect } from '../../pages/Stock/StockPage';
import { materialShape } from '../../domain/models/materialShape';
import { uid } from '../../utils/id';
import { GateDesignModal } from '../gates/GateDesignModal';
import { SlidingPanel } from '../gates/SlidingPanel';
import { resolveGate, setDim, SYSTEM_LABELS } from '../../domain/gates/design';

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


/**
 * Raspored ispune platna ili krila (svaki tip ograde): razmak od poda; uspravne letvice (odstojanje prve i poslednje od stuba i razmak);
 * vodoravne prečke koje se ponavljaju (odstojanje donje od dna, gornje od vrha i razmak); nosači (odstojanje od dna ili vrha ispune) i,
 * kod dvokrilne kapije, razmak između krila. Prikazuju se samo mere koje model ima, sa trenutnim vrednostima; „Vrati početne“ vraća
 * vrednosti kakve su bile kad je element izabran. Razmak letvica i prečki se računa tako da ravnomerno popune širinu ili visinu (broj se
 * prilagođava), a zadat razmak je najmanji razmak.
 */
function SlatSettings({ id, modelId, widthMm, heightMm, params, gate, clearWidth }: { id: string; modelId: FenceModelId; widthMm: number; heightMm: number; params: FenceParams; gate?: Gate; clearWidth: number }) {
  const [open, setOpen] = useState(false);
  const st = useAppStore.getState();
  const gC = gate && gate.gateType === 'double' && gate.design ? resolveGate(gate, clearWidth).values.gC?.v ?? null : null;
  const init = useRef<{ id: string; slats: FenceParams['slats']; lift: number | undefined; gC: number | null }>({ id, slats: params.slats, lift: params.liftMm, gC });
  if (init.current.id !== id) init.current = { id, slats: params.slats, lift: params.liftMm, gC };
  if (!isCustomModel(modelId)) return null;
  const lift = params.liftMm ?? customLiftOf(modelId);
  const lay = customSlatLayout(modelId, widthMm, heightMm - lift, params.slats);
  const hb = customHBarLayout(modelId, heightMm - lift, params.slats);
  // model sa vodoravnim ojačanjem: raspored prečki posebno u svakom polju, sa odstojanjima od ojačanja
  const zones = customHBarZones(modelId, heightMm - lift, params.slats);
  const setZone = (i: number, patch: { bottomMm?: number; topMm?: number; hGapMm?: number }) => {
    const zs = Array.from({ length: Math.max(i + 1, params.slats?.zones?.length ?? 0) }, (_, k) => params.slats?.zones?.[k]);
    zs[i] = { ...zs[i], ...patch };
    setSlat({ zones: zs });
  };
  const rails = customRails(modelId, params.slats);
  const half = Math.max(50, Math.round(widthMm / 2));
  const halfH = Math.max(50, Math.round((heightMm - lift) / 2));
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const sub = (t: string) => <div className="text-[12px] font-semibold text-muted uppercase tracking-wide mt-2 mb-0.5">{t}</div>;
  const setSlat = (patch: NonNullable<FenceParams['slats']>) => st.patchItemParams(id, { slats: { ...params.slats, ...patch } }, 'slats');
  const reset = () => {
    st.patchItemParams(id, { slats: init.current.slats, liftMm: init.current.lift });
    if (gate?.design && init.current.gC !== null) st.patchItem(id, { design: setDim(gate.design, 'gC', init.current.gC) });
  };
  return (
    <div className="mt-2 rounded-lg border border-line" data-testid="slat-settings">
      <button className="w-full flex items-center justify-between px-3 py-2 text-[13.5px] font-semibold" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="slat-settings-toggle">
        Raspored ispune i razmaci<span className="text-muted text-[12px] font-normal">{open ? 'Sakrij' : 'Prikaži'}</span>
      </button>
      {open && (
        <div className="px-3 pb-2">
          <NumberField label="Razmak od poda" testId="slat-floor" value={lift} range={{ min: 0, max: 500 }} onCommit={(v) => st.patchItemParams(id, { liftMm: v }, 'lift')} />
          {lay && (
            <>
              {sub('Uspravne letvice')}
              <NumberField label="Od levog stuba do prve letvice" testId="slat-left" value={Math.round(lay.left * 10) / 10} range={{ min: 0, max: half }} onCommit={(v) => setSlat({ leftMm: v })} />
              <NumberField label="Od poslednje letvice do desnog stuba" testId="slat-right" value={Math.round(lay.right * 10) / 10} range={{ min: 0, max: half }} onCommit={(v) => setSlat({ rightMm: v })} />
              <NumberField label="Razmak između letvica" testId="slat-gap" value={Math.round(lay.gap * 10) / 10} range={{ min: 0, max: 300 }} onCommit={(v) => setSlat({ gapMm: v })}
                hint={`Letvica: ${lay.count}. Razmak se podešava tako da letvice ravnomerno popune širinu.`} />
            </>
          )}
          {zones && zones.length > 0 && (
            <>
              {zones.map((z) => {
                const n = zones.length;
                const title = n === 1 ? 'Vodoravne prečke' : z.first ? 'Prečke ispod ojačanja' : z.last ? 'Prečke iznad ojačanja' : 'Prečke između ojačanja';
                return (
                  <div key={z.index} data-testid={`hbar-zone-${z.index}`}>
                    {sub(title)}
                    <NumberField label={z.first ? 'Od dna ispune do donje prečke' : 'Od ojačanja do donje prečke'} testId={`hbar-zone-${z.index}-bottom`} value={r1(z.bottom)} range={{ min: 0, max: 2000 }} onCommit={(v) => setZone(z.index, { bottomMm: v })} />
                    <NumberField label={z.last ? 'Od gornje prečke do vrha ispune' : 'Od gornje prečke do ojačanja'} testId={`hbar-zone-${z.index}-top`} value={r1(z.top)} range={{ min: 0, max: 2000 }} onCommit={(v) => setZone(z.index, { topMm: v })} />
                    <NumberField label="Razmak između prečki" testId={`hbar-zone-${z.index}-gap`} value={r1(z.gap)} range={{ min: z.gap < 0 ? -100 : 0, max: 400 }} onCommit={(v) => setZone(z.index, { hGapMm: v })}
                      hint={`Prečki: ${z.count}. Staje najviše prečki sa zadatim razmakom, a višak se ravnomerno deli na sve razmake.`} />
                  </div>
                );
              })}
            </>
          )}
          {!zones && hb && (
            <>
              {sub('Vodoravne prečke')}
              <NumberField label="Od dna ispune do donje prečke" testId="hbar-bottom" value={r1(hb.bottom)} range={{ min: 0, max: halfH }} onCommit={(v) => setSlat({ bottomMm: v })} />
              <NumberField label="Od gornje prečke do vrha ispune" testId="hbar-top" value={r1(hb.top)} range={{ min: 0, max: halfH }} onCommit={(v) => setSlat({ topMm: v })} />
              {(hb.gapMin < 0 || hb.lufta === 'bez') && (
                <div className="flex items-center justify-between gap-2 py-1" data-testid="hbar-lufta">
                  <span className="text-[13px]">Tip prečki</span>
                  <ChoiceGroup label="Tip prečki" value={hb.lufta}
                    options={([['sa', 'Sa luftom'], ['bez', 'Bez lufta']] as const).map(([v, label]) => ({ value: v, label, testId: `hbar-lufta-${v}` }))}
                    onChange={(v) => v !== hb.lufta && setSlat({ lufta: v, hGapMm: v === 'bez' ? Math.min(0, r1(hb.gap)) : Math.max(0, r1(hb.gap)) })} />
                </div>
              )}
              <NumberField label="Razmak između prečki" testId="hbar-gap" value={r1(hb.gap)} range={hb.lufta === 'bez' ? { min: Math.min(0, hb.gapMin), max: 0 } : { min: 0, max: 400 }} onCommit={(v) => setSlat({ hGapMm: v })}
                hint={`Prečki: ${hb.count}. Staje najviše prečki sa zadatim razmakom, a višak se ravnomerno deli na sve razmake.`} />
            </>
          )}
          {rails.length > 0 && (
            <>
              {sub('Nosači')}
              {rails.map((r) => (
                <NumberField key={r.key} label={r.label} testId={`rail-${r.edge}-${r.key}`} value={r1(r.offsetMm)} range={{ min: 0, max: Math.max(0, Math.round(heightMm - lift - r.heightMm)) }}
                  onCommit={(v) => setSlat({ rails: { ...params.slats?.rails, [r.key]: v } })} />
              ))}
            </>
          )}
          {gC !== null && sub('Krila')}
          {gC !== null && <NumberField label="Razmak između krila" testId="slat-leaf-gap" value={gC} range={{ min: 0, max: 200 }} onCommit={(v) => gate?.design && st.patchItem(id, { design: setDim(gate.design, 'gC', v) }, 'gC')} />}
          <button className="btn btn-sm mt-1" data-testid="slat-reset" onClick={reset}>Vrati početne vrednosti</button>
        </div>
      )}
    </div>
  );
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
  const modelSpecs = useAppStore((s) => s.settings.modelSpecs);
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
          <NumberField label="Zadata dužina (osa–osa)" testId="fixed-total" value={s.fixedTotalMm} range={LIMITS.fixedTotal} onCommit={(v) => mutate((p) => ({ ...p, settings: { ...p.settings, fixedTotalMm: v } }), 'fixed')} />
          {status.state === 'over' && <Banner tone="red"><b>Prekoračenje za {fmtMm(status.diffMm)}.</b> Elementi ({fmtMm(layout.totalModularMm)}) premašuju zadatu dužinu ({fmtMm(s.fixedTotalMm)}). Smanjite elemente ili ih rasporedite automatski.</Banner>}
          {status.state === 'under' && <Banner tone="amber">Slobodan prostor: <b>{fmtMm(status.diffMm)}</b> do zadate dužine. Možete ga ostaviti ili automatski rasporediti.</Banner>}
          {status.state === 'ok' && <Banner tone="blue">Raspored tačno popunjava zadatu dužinu osa–osa.</Banner>}
          <SelectField label="Raspodela" value={s.fillStrategy} testId="fill-strategy" options={[{ value: 'proportional', label: 'Proporcionalno širini' }, { value: 'even', label: 'Ravnomerno' }]} onChange={(v) => mutate((p) => ({ ...p, settings: { ...p.settings, fillStrategy: v } }))} />
          <div className="grid grid-cols-1 gap-2 mt-1">
            <button className="btn btn-sm btn-primary w-full" data-testid="btn-autofill" disabled={status.state === 'ok'} title="Prilagođava širine nezaključanih platana i otvora zadatoj dužini. Kapije zadržavaju svoju širinu." onClick={doFill}>Automatski rasporedi</button>
            <button className="btn btn-sm w-full" data-testid="btn-leave-free" disabled={status.state !== 'under'} title="Zadržava postojeće mere i potvrđuje preostali slobodan prostor porukom. Ne dodaje novi otvor u crtež." onClick={() => setNotice(`Zadržane su postojeće širine. Preostalo je ${fmtMm((status as { diffMm: number }).diffMm)} slobodnog prostora do zadate dužine osa–osa.`)}>Ostavi slobodan prostor</button>
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
        <span className="text-muted">Stubova za izradu</span><b className="text-right" data-testid="count-posts">{productionPostCount(project, layout, modelSpecs)}</b>
        {layout.postCount > 0 && <><span className="text-muted">Zasebnih oslonaca (zajedničkih)</span><b className="text-right">{layout.postCount} ({layout.sharedPostCount})</b></>}
      </div>

      {project.items.some((i) => i.kind === 'fence' && isTerraceModel(i.modelId) && isCustomModel(i.modelId)) && (() => {
        const firstFence = project.items.find((i): i is FenceSection => i.kind === 'fence' && isCustomModel(i.modelId));
        const modelJoint = (firstFence && customModelOf(firstFence.modelId)?.cornerJoint) || 'ball';
        const joint = s.cornerJoint ?? modelJoint;
        return (
          <>
            <SegmentedField label="Spoj na uglu" testId="project-corner-joint" value={joint} options={[{ value: 'ball', label: 'Kuglasti zglob' }, { value: 'elbow', label: 'Koleno' }]}
              onChange={(v) => mutate((p) => ({ ...p, settings: { ...p.settings, cornerJoint: v as 'ball' | 'elbow' }, updatedAt: new Date().toISOString() }), 'corner-joint')} />
            {joint === 'elbow' && (
              <NumberField label="Krak kolena" testId="project-corner-arm" unit="mm" value={s.cornerArmMm ?? 40} range={{ min: 0, max: 300 }}
                onCommit={(v) => mutate((p) => ({ ...p, settings: { ...p.settings, cornerArmMm: v }, updatedAt: new Date().toISOString() }), 'corner-arm')} hint="Za toliko se skraćuje svaka cev (prečka i rukohvat) uz koleno" />
            )}
            {project.items.some((it) => it.kind === 'fence' && it.params.slats?.cornerConnections?.some((c) => c.fitting?.shape.requiresMaterial)) &&
              <p className="text-[12px] text-[#b42318] mt-1" data-testid="corner-missing-material">Za neke uglove ili prostorne prelaze nije nađen odgovarajući spoj u cenovniku. Krojna lista navodi potreban ugao; dodajte odgovarajući okov u Materijali i cene.</p>}
          </>
        );
      })()}
      <NumberField label="Visina (svi)" value={firstHeight} range={LIMITS.fenceHeight} testId="all-height" onCommit={(v) => mutate((p) => setAllHeights(p, v), 'allh')} />
      <ColorField label="Boja (sve)" value={s.defaultColor} testId="all-color" onChange={(c) => mutate((p) => setAllColors(p, c))} finish={s.defaultFinish} onFinishChange={(f) => mutate((p) => setAllFinishes(p, f))} />
      {project.items.some((i) => i.kind === 'fence') && !project.items.some((i) => i.kind === 'fence' && isTerraceModel(i.modelId)) && (
        <ToggleField label="Podnožje ograda" testId="field-all-plinth" checked={layout.items.every((l) => l.item.kind !== 'fence' || l.plinthMm > 0)} onLabel="Sve ograde na podnožju" offLabel="Bez podnožja" onChange={(v) => mutate((p) => setAllPlinths(p, v))} />
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
/** stubovi kapije (za sve vrste kapija): zajednički stub sa susedom, ili svoj stub levo, desno ili sa obe strane, i razmak do susednog stuba */
function GateOwnPosts({ project, id, g }: { project: Project; id: string; g: Gate }) {
  const st = useAppStore.getState();
  const side: 'left' | 'right' | 'both' = g.ownPostsSide ?? 'both';
  // stubovi koje kapija ima za sebe: levi (pre kapije) i/ili desni (posle nje)
  const at = indexOfItem(project, id);
  const own = g.ownPosts ? [(!g.ownPostsSide || g.ownPostsSide === 'left') ? project.posts[at] : undefined, (!g.ownPostsSide || g.ownPostsSide === 'right') ? project.posts[at + 1] : undefined].filter((x): x is Post => !!x) : [];
  const first = own[0];
  const patchOwn = (patch: Partial<Post>, key?: string) => st.mutate((pr) => own.reduce((q, x) => updatePost(q, x.id, patch), pr), key ?? null);
  return (
    <>
      <SegmentedField label="Stubovi kapije" testId="field-gate-own-posts" value={g.ownPosts ? 'own' : 'shared'} options={[{ value: 'shared', label: '1 stub' }, { value: 'own', label: '2 stuba' }]} onChange={(v) => st.mutate((pr) => setGatesOwnPosts(pr, v === 'own', [id]))} />
      {g.ownPosts && (
        <>
          <SegmentedField label="Svoj stub sa strane" testId="field-gate-own-posts-side" value={side} options={[{ value: 'left', label: 'Levo' }, { value: 'right', label: 'Desno' }, { value: 'both', label: 'Obe' }]}
            onChange={(v) => st.mutate((pr) => setGatesOwnPosts(pr, true, [id], v === 'both' ? undefined : v))} />
          <NumberField label="Razmak stubova" testId="field-gate-post-gap" value={g.postGapMm ?? OWN_POSTS_GAP_MM} range={{ min: 0, max: 500 }} onCommit={(v) => st.patchItem(id, { postGapMm: v }, 'postgap')} hint="Razmak između stuba ograde i stuba kapije" />
          {first && (
            <>
              <SelectField label="Tip stuba" testId="field-gate-post-type" value={first.type} options={(Object.entries(POST_LABELS) as [Post['type'], string][]).filter(([value]) => MANUAL_POST_TYPES.includes(value) || value === first.type).map(([value, label]) => ({ value, label }))} onChange={(v) => patchOwn({ type: v })} />
              <NumberField label="Širina preseka stuba" testId="field-gate-post-width" value={first.widthMm} range={LIMITS.postWidth} onCommit={(v) => patchOwn({ widthMm: v }, 'gpw')} hint={own.length > 1 ? 'Važi za oba stuba kapije' : 'Stub kapije'} />
            </>
          )}
        </>
      )}
    </>
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
  const label = `${itemLabel(project.items, index)}${it.kind === 'fence' && it.stair ? ' — Stepenište' : ''}`;
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
    const count = computeInfill(it.modelId, li.clearWidth, it.heightMm, it.params.frameMm, it.params.barSizeMm, it.params.gapMm, it.params.barCount).bars.filter((b: { tone: string }) => b.tone === 'main').length;
    body = (
      <>
        {common}
        <ModelSelect value={it.modelId} onChange={(m) => st.setItemModel(id, m)} />
        <ColorField stacked value={it.color} testId="field-color" onChange={(c) => st.setItemColor(id, c)} finish={it.finish} onFinishChange={(f) => st.setItemFinish(id, f)} />
        {def.hasBars && (
          <>
            <NumberField label={def.barLabel} testId="field-bar" value={it.params.barSizeMm} range={isRl10Model(it.modelId) ? { min: 8, max: 40 } : LIMITS.barSize}
              onCommit={(v) => (isRl10Model(it.modelId) ? st.mutate((p) => setRl10Params(p, { barSizeMm: v }), 'rl10-bar') : st.patchItemParams(id, { barSizeMm: v }, 'bar'))} />
            {def.rods ? (
              <NumberField label="Broj prečki" testId="field-rods" unit="kom" step={1} value={rodCountFor(it.modelId, it.params, it.heightMm) ?? def.rods.default}
                range={{ min: def.rods.min, max: maxRods(it.modelId, it.heightMm) }} onCommit={(v) => st.patchItemParams(id, { barCount: v }, 'rods')}
                hint={`Razmak ${Math.round((it.heightMm - 200) / (rodCountFor(it.modelId, it.params, it.heightMm) ?? def.rods.default))} mm`} />
            ) : (
              <NumberField label={def.gapLabel} testId="field-gap" value={it.params.gapMm} range={LIMITS.gap} onCommit={(v) => st.patchItemParams(id, { gapMm: v }, 'gap')} hint={`Profila: ${count}`} />
            )}
          </>
        )}
        {def.style !== 'rods' && def.style !== 'glass_rail' && def.style !== 'custom' && (
          <NumberField label={def.frameLabel ?? 'Debljina rama'} value={it.params.frameMm} range={LIMITS.frame} onCommit={(v) => st.patchItemParams(id, { frameMm: v }, 'frame')} />
        )}
        {!isTerraceModel(it.modelId) && <>
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
        </>}
        {isRl10Model(it.modelId) && <Rl10Parts params={it.params} />}
        {isTubesModel(it.modelId) && <TubesParts params={it.params} />}
        {customModelOf(it.modelId)?.terraceSourceId && <SlatSettings id={id} modelId={it.modelId} widthMm={li.clearWidth} heightMm={it.heightMm} params={it.params} clearWidth={li.clearWidth} />}
        <GlassToleranceSettings id={id} modelId={it.modelId} params={it.params} widthMm={li.clearWidth} heightMm={it.heightMm}
          stairTan={stairIn && li.axisEnd > li.axisStart ? (li.floorEnd - li.floorStart) / (li.axisEnd - li.axisStart) : 0} />
        {isTerraceModel(it.modelId) ? (isCustomModel(it.modelId) && <><TerraceRodSettings id={id} modelId={it.modelId} widthMm={li.clearWidth} heightMm={it.heightMm} params={it.params} /><TerracePostSettings id={id} modelId={it.modelId} widthMm={li.clearWidth} heightMm={it.heightMm} params={it.params} stairSteps={stairGroupAt(project.items, index)?.steps} stairUp={(stairGroupAt(project.items, index)?.riseMm ?? 0) >= 0} /></>) : (<>
        <SlatSettings id={id} modelId={it.modelId} widthMm={li.clearWidth} heightMm={it.heightMm} params={it.params} clearWidth={li.clearWidth} />
        <ReinforceSettings id={id} modelId={it.modelId} widthMm={li.clearWidth} heightMm={it.heightMm} params={it.params} />
        </>)}
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
                  <SegmentedField label="Mere stepenika" testId="field-stair-mode" value={grp.dims ? 'each' : 'all'} options={[{ value: 'all', label: 'Svi isti' }, { value: 'each', label: 'Svaki posebno' }]}
                    onChange={(v) => mutateStair({ stepMode: v as 'all' | 'each' }, 'stair-mode')} />
                  {!grp.dims && (
                    <>
                      <NumberField label="Gazište jednog stepenika" testId="field-stair-tread" value={Math.round((grp.runMm / grp.steps) * 10) / 10} range={{ min: 10, max: 2000 }}
                        onCommit={(v) => mutateStair({ outerRunMm: v * grp.steps + (outerRun - grp.runMm) }, 'stair-tread')} hint="Menja dužinu stepeništa (broj stepenika ostaje)" />
                      <NumberField label="Visina jednog stepenika" testId="field-stair-riser" value={Math.round((Math.abs(rise) / grp.steps) * 10) / 10} range={{ min: 10, max: 1000 }}
                        onCommit={(v) => mutateStair({ riseMm: Math.sign(rise || 1) * v * grp.steps }, 'stair-riser')} hint="Menja visinsku razliku (broj stepenika ostaje)" />
                    </>
                  )}
                  {grp.dims && <StepDimsEditor dims={grp.dims} onApply={(index, treadMm, riseMm) => mutateStair({ stepDim: { index, treadMm, riseMm } }, `stair-step:${index}`)} />}
                  {!isCustomModel(it.modelId) && <NumberField label="Broj stubova" testId="field-stair-posts" unit="kom" step={1} value={fields + 1} range={{ min: 2, max: Math.min(MAX_FIELDS, grp.steps + 1) + 1 }}
                    onCommit={(v) => mutateStair({ fields: v - 1 }, 'stair-posts')}
                    hint={`Prvi i poslednji stub su na krajevima, ostali po sredini stepenika. Preporuka: na svaki treći stepenik (${recommendedStairPosts(grp.steps) + 2} stubova)${grp.fieldsCustom ? '' : ' — izabrano automatski'}`}/>}
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
                            hint={which === 'end' ? 'Ograda posle stepeništa skreće u stranu. Rukohvat i prečke spajaju se odgovarajućim ugaonim spojem.' : 'Ugao u osnovi na zglobu na početku stepeništa'} />
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
      </>
    );
  } else {
    const g: Gate = it;
    const swing = g.gateType !== 'sliding';
    // klizna kapija kao sklop: mere, pozicije, proba hoda i sastavnica u svom panelu (stara polja klizne kapije bi im protivrečila)
    if (g.sliding) body = (
      <>
        <GateDesignEntry project={project} gate={g} />
        <GateOwnPosts project={project} id={id} g={g} />
        {/* krilo klizne kapije: model ograde ili nacrtan model kapije, kao kod ostalih kapija */}
        {g.sliding.drawnLeaf && <ModelSelect value={fenceModelOfGate(g)} onChange={(m) => st.setItemModel(id, m)} />}
        <SlidingPanel project={project} gate={g} />
        {g.sliding.drawnLeaf && <ReinforceSettings id={id} modelId={g.infillModelId} widthMm={li.clearWidth} heightMm={leafHeightOf(g)} params={g.params} />}
        <ColorField stacked value={g.color} testId="field-color" onChange={(c) => st.setItemColor(id, c)} finish={g.finish} onFinishChange={(f) => st.setItemFinish(id, f)} />
      </>
    );
    else body = (
      <>
        <GateDesignEntry project={project} gate={g} />
        <GateOwnPosts project={project} id={id} g={g} />
        {common}
        <GateFrameBox gate={g} />
        <GateModelPicker gate={g} />
        <ModelSelect value={fenceModelOfGate(g)} onChange={(m) => st.setItemModel(id, m)} />
        <ColorField stacked value={g.color} testId="field-color" onChange={(c) => st.setItemColor(id, c)} finish={g.finish} onFinishChange={(f) => st.setItemFinish(id, f)} />
        <SegmentedField label={g.gateType === 'sliding' ? 'Smer klizanja' : g.gateType === 'double' ? 'Aktivno krilo (sa ulice)' : 'Strana šarki'} testId="field-opening" value={g.opening} options={[{ value: 'left', label: 'Levo' }, { value: 'right', label: 'Desno' }]} onChange={(v) => st.patchItem(id, { opening: v, ...(g.gateType === 'double' && g.design?.activeLeaf ? { design: { ...g.design, activeLeaf: v } } : {}) })} />
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
        {g.gateType !== 'sliding' && <SlatSettings id={id} modelId={g.infillModelId} widthMm={gateLeafPoses(g, li.clearStart, li.clearEnd, 0)[0]?.widthMm ?? li.clearWidth} heightMm={leafHeightOf(g)} params={g.params} gate={g} clearWidth={li.clearWidth} />}
        {g.gateType !== 'sliding' && <ReinforceSettings id={id} modelId={g.infillModelId} widthMm={gateLeafPoses(g, li.clearStart, li.clearEnd, 0)[0]?.widthMm ?? li.clearWidth} heightMm={leafHeightOf(g)} params={g.params} />}
      </>
    );
  }

  // ograda za terasu: širina se menja u polju Širina, a podnožje i ojačanje se ne nude
  const terraceFence = it.kind === 'fence' && isTerraceModel(it.modelId);
  return (
    <Section title={`Odabran element: ${label}`} testId="panel-item">
      <div className="flex flex-wrap gap-1.5 mb-2" data-testid="item-actions">
        {!terraceFence && <button className="btn btn-sm" data-testid="btn-move-left" disabled={index === 0} onClick={() => st.moveSelected(-1)}><ArrowLeft size={14} />Pomeri levo</button>}
        {!terraceFence && <button className="btn btn-sm" data-testid="btn-move-right" disabled={index === project.items.length - 1} onClick={() => st.moveSelected(1)}>Pomeri desno<ArrowRight size={14} /></button>}
        {!terraceFence && <button className="btn btn-sm" data-testid="btn-duplicate" onClick={() => st.duplicateSelected(1)}><Copy size={14} />Dupliraj</button>}
        <button className="btn btn-sm btn-danger" data-testid="btn-delete" onClick={st.deleteSelected}><Trash2 size={14} />Obriši</button>
      </div>
      {!terraceFence && <DuplicateMany kind={it.kind} />}
      {(it.kind === 'fence' || it.kind === 'gate') && <ScopeToggle project={project} id={id} kind={it.kind} terrace={terraceFence} />}
      {terraceFence && <FieldRotation project={project} index={index} />}
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
/** vrednost u meniju „Šablon stuba“ koja vraća stub kakav je bio kad je ograda postavljena */
const BASE_POST = '__base__';

function PostPanel({ project, id }: { project: Project; id: string }) {
  const [allPosts, setAllPostsState] = useState(applyToAllPosts);
  const setAllPosts = (v: boolean) => { applyToAllPosts = v; setAllPostsState(v); };
  const multiPosts = useAppStore((s) => s.editor.multiPosts);
  const templates = useAppStore((s) => s.settings.postTemplates) ?? [];
  const materials = useAppStore((s) => s.materials);
  const [tplName, setTplName] = useState<string | null>(null);
  const [tplMsg, setTplMsg] = useState<string | null>(null);
  const st = useAppStore.getState();
  const layout = computeLayout(project);
  const lp = layout.posts.find((p) => p.post.id === id);
  if (!lp) return null;
  const p = lp.post;
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
        <ScopeField testId="post-caps-all" value={allPosts ? 'all' : 'one'} onChange={(v) => setAllPosts(v === 'all')}
          options={[{ value: 'one', label: 'Samo ovaj stub' }, { value: 'all', label: 'Sve stubove' }]} count={targets.length} />
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
      {lp.index === project.items.length && project.items.length > 0 && project.items[project.items.length - 1].kind !== 'opening' && (
        <div data-testid="post-corner">
          <div className="label pb-1">Ugao ograde</div>
          <div className="flex gap-1.5 pb-1 flex-wrap">
            {[-90, -45, 45, 90].map((a) => (
              <button key={a} className="btn btn-sm" data-testid={`corner-${a}`} title="Dodaje novo platno posle ovog stuba, skrenuto za zadati ugao"
                onClick={() => { const m = projectModelId(project.items); if (!m) return; st.addElement({ kind: 'fence', modelId: m }); st.patchPost(id, { turnDeg: a }); useAppStore.setState((x) => ({ editor: { ...x.editor, selection: { type: 'post', id }, multi: [] } })); }}>
                {a > 0 ? '+' : ''}{a}°
              </button>
            ))}
          </div>
          <div className="text-[11.5px] text-muted pb-1.5">Nastavlja ogradu pod uglom posle ovog stuba (dodaje novo platno). Ugao se kasnije menja na stubu između dva platna.</div>
        </div>
      )}
      <div className="py-1.5" data-testid="post-template">
        <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.45fr)] items-center gap-x-3">
          <label className="label" htmlFor="post-template-select">Šablon stuba</label>
          <select id="post-template-select" className="input" data-testid="post-template-select" value={p.templateId && templates.some((t) => t.id === p.templateId) ? p.templateId : p.templateId ? '' : BASE_POST}
            onChange={(e) => {
              const v = e.target.value;
              if (v === BASE_POST) st.mutate((pr) => restoreBasePosts(pr, targets.filter((tid) => { const q = pr.posts.find((x) => x.id === tid); return q && (q.templateId || q.basePost); })));
              else if (v) st.applyPostTemplate(v, targets);
              setTplMsg(null);
            }}>
            {p.templateId && !templates.some((t) => t.id === p.templateId) && <option value="">— šablon je obrisan —</option>}
            <option value={BASE_POST}>Osnovni stub</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {p.type !== 'concrete' && p.type !== 'concrete_plinth' && (() => {
          // presek stuba: cev iz koje se stub seče (krojna lista, radni nalog, trebovanje); bez izbora standardna cev iste mere (80 × 80 → 80 × 80 × 3)
          const def = defaultPostMaterial(p, materials);
          const linear = (m: Material) => { const s = materialShape(m); return s.type === 'linear' && !s.u && (s.group === 'kv' || s.group === 'okrugle'); };
          return (
            <div className="mt-1.5" data-testid="post-material">
              <div className="text-[13px] mb-1">Materijal stuba (presek)</div>
              <MaterialSelect materials={materials} only={linear} value={p.materialId && materials.some((m) => m.id === p.materialId) ? p.materialId : ''} testId="post-material-select"
                emptyLabel={def ? `Standardno: ${def.name}` : 'Standardni stub (po komadu)'} onChange={(v) => applyPatch({ materialId: v || undefined }, 'post-mat')} />
              {p.materialId && !materials.some((m) => m.id === p.materialId) && <div className="text-[12px] text-[#b45309] mt-0.5">Izabrani materijal je obrisan iz cenovnika.</div>}
            </div>
          );
        })()}
        {tplName === null
          ? <button className="btn btn-sm mt-1.5" data-testid="post-template-save" onClick={() => { setTplName(''); setTplMsg(null); }}>Sačuvaj stub kao šablon</button>
          : (
            <div className="flex gap-1.5 mt-1.5">
              <input className="input !py-1" data-testid="post-template-name" aria-label="Naziv šablona stuba" placeholder="Naziv šablona" value={tplName} autoFocus onChange={(e) => setTplName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setTplName(null); }} />
              <button className="btn btn-sm btn-primary" data-testid="post-template-save-confirm" disabled={!tplName.trim()} onClick={() => { const t = templateFromPost(p, uid('pt'), tplName); st.upsertPostTemplate(t); st.patchPost(id, { templateId: t.id }); setTplMsg(`Šablon „${t.name}“ je sačuvan.`); setTplName(null); }}>Sačuvaj</button>
              <button className="btn btn-sm" onClick={() => setTplName(null)}>Otkaži</button>
            </div>
          )}
        {tplMsg && <div className="text-[12px] text-[#067647] mt-1" role="status">{tplMsg}</div>}
        <div className="text-[11.5px] text-muted mt-1">Šabloni se prave i menjaju u Podešavanjima (Šabloni stubova). Izbor važi za stubove na koje važe izmene.</div>
      </div>
      <SelectField label="Tip" testId="post-type" value={p.type} options={(Object.entries(POST_LABELS) as [typeof p.type, string][]).filter(([value]) => MANUAL_POST_TYPES.includes(value) || value === p.type).map(([value, label]) => ({ value, label }))} onChange={(v) => applyPatch({ type: v })} />
      <NumberField label="Širina preseka" value={p.widthMm} range={LIMITS.postWidth} onCommit={(v) => applyPatch({ widthMm: v }, 'pw')} />
      <div className="flex gap-1.5 pb-1.5">{POST_SIZES.map((s) => <button key={s} className={`btn btn-sm ${p.widthMm === s ? 'btn-primary' : ''}`} onClick={() => applyPatch({ widthMm: s })}>{s}×{s}</button>)}</div>
      {p.type === 'concrete_plinth' && <NumberField label="Visina podnožja" testId="post-plinth" value={p.plinthMm ?? PLINTH_DEFAULT_MM} range={{ min: 100, max: 1200 }} onCommit={(v) => applyPatch({ plinthMm: v }, 'pp')} />}
      <NumberField label="Visina" value={p.heightMm} range={LIMITS.postHeight} onCommit={(v) => applyPatch({ heightMm: v }, 'ph')}
        hint={`${p.heightCustom ? 'Ručno zadata' : 'Automatska'} visina iznad podnožja ograde (ne zavisi od visine podnožja). Dužina stuba: ${fmtMm(lp.lengthMm)}${lp.baseMm > 0 ? ' (stoji na podnožju)' : ''}`} />
      {p.heightCustom && <button className="btn btn-sm mb-1.5" data-testid="post-height-auto" onClick={() => st.mutate((pr) => resetPostHeights(pr, targets))}>Vrati automatsku visinu</button>}
      {/* betonski stub ima boju betona: izbor boje menjao bi boju aluminijumskog stuba koji nije ni postavljen */}
      {!targets.every((tid) => { const t = project.posts.find((x) => x.id === tid)?.type; return t === 'concrete' || t === 'concrete_plinth'; }) && <ColorField testId="post-color" value={p.color} onChange={(c) => applyPatch({ color: c })} finish={p.finish} onFinishChange={(f) => applyPatch({ finish: f })} />}
      <SelectField label="Montaža" value={p.mounting} options={Object.entries(MOUNTING_LABELS).map(([value, label]) => ({ value: value as typeof p.mounting, label }))} onChange={(v) => applyPatch({ mounting: v })} />
      {(() => {
        // kapa i dno stuba: samo materijali iz cenovnika koji dolaze u obzir za ovaj stub (vrsta dela i mera preseka); po stubu
        if (p.type === 'concrete' || p.type === 'concrete_plinth' || p.type === 'decorative') return null;
        const size = p.round ? `Ø${fmtNum(p.widthMm, 0)}` : `${fmtNum(p.widthMm, 0)}×${fmtNum(p.widthMm, 0)}`;
        const top = capOptions(materials, p, 'top', p.capTopMaterialId);
        const bottom = capOptions(materials, p, 'bottom', p.capBottomMaterialId);
        const pick = (slot: CapSlot, v: string) => applyPatch(capPatch(materials, slot, v));
        return (
          <div data-testid="post-caps">
            <SelectField label="Kapa (vrh)" testId="post-cap-top" value={p.capTopMaterialId ?? ''} options={top.options} onChange={(v) => pick('top', v)} />
            {top.empty && <div className="text-[11.5px] text-muted pb-1">U cenovniku nema kape ni čepa za stub {size} mm.</div>}
            <SelectField label="Dno (rozetna)" testId="post-cap-bottom" value={p.capBottomMaterialId ?? ''} options={bottom.options} onChange={(v) => pick('bottom', v)} />
            {bottom.empty && <div className="text-[11.5px] text-muted pb-1">U cenovniku nema rozetne ni stope za stub {size} mm.</div>}
          </div>
        );
      })()}
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
  const [sketchOpen, setSketchOpen] = useState(false);
  const [reqOpen, setReqOpen] = useState(false);
  const customer = customers.find((c) => c.id === project.customerId) ?? null;
  const price = useMemo(() => computePrice(project, materials, specs), [project, materials, specs]);
  const money = (n: number) => fmtMoney(n, settings.currency, settings.currencyRateToEur);
  return (
    <>
    <Section title="Kalkulacija cene" testId="panel-price">
      <IncompletePriceNotice count={price.unpricedCount} />
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
      <div className="grid grid-cols-2 gap-2 mt-3">
        <button className="btn !px-2 !gap-1.5 text-[13px]" data-testid="btn-open-calc" onClick={() => window.dispatchEvent(new CustomEvent('open-calc'))}><Calculator size={16} />Detaljan obračun</button>
        <button className="btn !px-2 !gap-1.5 text-[13px]" data-testid="btn-requisition" title="Trebovanje materijala: sav materijal iz sastavnica, profili u celim šipkama; količine se mogu promeniti pre štampe" onClick={() => setReqOpen(true)}><PackageCheck size={16} />Trebovanje</button>
      </div>
      {/* dokumenti odmah uz cenu, da se ne skroluje do dna panela */}
      <div className="grid grid-cols-2 gap-2 mt-2">
        <button className="btn !px-2 !py-1.5 !gap-1.5 text-[13px]" data-testid="btn-pdf" onClick={() => setPdfOpen(true)}><FileDown size={17} />PDF ponuda</button>
        <button className="btn !px-2 !py-1.5 !gap-1.5 text-[13px]" data-testid="btn-cutlist" onClick={() => setCutOpen(true)}><Scissors size={17} />Krojna lista</button>
        <button className="btn !px-2 !py-1.5 !gap-1.5 text-[13px]" data-testid="btn-workorder" onClick={() => setOrderOpen(true)}><ClipboardList size={17} />Radni nalog</button>
        <button className="btn !px-2 !py-1.5 !gap-1.5 text-[13px]" data-testid="btn-sketch" onClick={() => setSketchOpen(true)}><Ruler size={17} />Skica</button>
      </div>
    </Section>
    {pdfOpen && <PdfPreviewModal project={project} customer={customer} materials={materials} settings={settings} onClose={() => setPdfOpen(false)} />}
    {reqOpen && <RequisitionModal project={project} customer={customer} materials={materials} settings={settings} onClose={() => setReqOpen(false)} />}
    {orderOpen && <PdfPreviewModal kind="workorder" project={project} customer={customer} materials={materials} settings={settings} onClose={() => setOrderOpen(false)} />}
    {sketchOpen && <PdfPreviewModal kind="sketch" project={project} customer={customer} materials={materials} settings={settings} onClose={() => setSketchOpen(false)} />}
    {cutOpen && <PdfPreviewModal kind="cutlist" askOffcuts project={project} customer={customer} materials={materials} settings={settings} onClose={() => setCutOpen(false)} />}
    </>
  );
}

export function PropertiesPanel({ project }: { project: Project }) {
  const selection = useAppStore((s) => s.editor.selection);
  const multi = useAppStore((s) => s.editor.multi);
  return (
    <div className="properties-panel space-y-4" data-testid="properties">
      {selection?.type === 'item' && multi.length > 1 && <MultiPanel key={multi.join(':')} project={project} ids={multi} />}
      {selection?.type === 'item' && multi.length < 2 && <ItemPanel key={selection.id} project={project} id={selection.id} />}
      {selection?.type === 'post' && <PostPanel key={selection.id} project={project} id={selection.id} />}
      {project.items.length > 0 && <PriceSummary project={project} />}
      <ProjectBasics project={project} />
    </div>
  );
}


/**
 * Stepenište sa merama „svaki stepenik posebno“: padajući meni sa brojem stepenika, upis dubine gazišta i visine i dugme „Dodaj“; ispod je
 * spisak mera svih stepenika (klik na red bira stepenik). Ukupna dužina i visinska razlika stepeništa se računaju iz zbira.
 */
function StepDimsEditor({ dims, onApply }: { dims: { treadMm: number; riseMm: number }[]; onApply: (index: number, treadMm: number, riseMm: number) => void }) {
  const [idx, setIdx] = useState(0);
  const i = Math.min(idx, dims.length - 1);
  const [tread, setTread] = useState('');
  const [rise, setRise] = useState('');
  const cur = dims[i];
  const fmt = (v: number) => String(Math.round(v * 10) / 10);
  const tv = tread === '' ? cur.treadMm : Number(tread.replace(',', '.'));
  const rv = rise === '' ? cur.riseMm : Number(rise.replace(',', '.'));
  const ok = Number.isFinite(tv) && Number.isFinite(rv) && tv >= 10 && rv >= 10;
  const pick = (k: number) => { setIdx(k); setTread(''); setRise(''); };
  return (
    <div className="rounded-lg border border-line p-2 my-1.5" data-testid="stair-step-dims">
      <div className="grid grid-cols-[auto_1fr_1fr] items-end gap-2">
        <label className="text-[12px] text-muted">Stepenik
          <select className="input !py-1 mt-0.5" aria-label="Broj stepenika" data-testid="stair-step-pick" value={i} onChange={(e) => pick(Number(e.target.value))}>
            {dims.map((_, k) => <option key={k} value={k}>{k + 1}</option>)}
          </select>
        </label>
        <label className="text-[12px] text-muted">Gazište (mm)
          <input className="input !py-1 mt-0.5 tabular-nums" type="number" min={10} step={1} aria-label="Dubina gazišta" data-testid="stair-step-tread" value={tread === '' ? fmt(cur.treadMm) : tread} onChange={(e) => setTread(e.target.value)} />
        </label>
        <label className="text-[12px] text-muted">Visina (mm)
          <input className="input !py-1 mt-0.5 tabular-nums" type="number" min={10} step={1} aria-label="Visina stepenika" data-testid="stair-step-rise" value={rise === '' ? fmt(cur.riseMm) : rise} onChange={(e) => setRise(e.target.value)} />
        </label>
      </div>
      <button className="btn btn-sm btn-primary mt-2" disabled={!ok} data-testid="stair-step-add" onClick={() => { onApply(i, tv, rv); setTread(''); setRise(''); if (i < dims.length - 1) setIdx(i + 1); }}>Dodaj</button>
      <ol className="mt-2 text-[12.5px] divide-y divide-line/60" data-testid="stair-step-list">
        {dims.map((d, k) => (
          <li key={k}><button type="button" className={`w-full flex justify-between px-1.5 py-0.5 text-left tabular-nums ${k === i ? 'bg-primary-50 font-semibold' : 'hover:bg-slate-50'}`} onClick={() => pick(k)}>
            <span>Stepenik {k + 1}</span><span>gazište {fmt(d.treadMm)} mm · visina {fmt(d.riseMm)} mm</span></button></li>
        ))}
      </ol>
    </div>
  );
}

/** Razmaci između pojedinih prečki: padajući meni („između prečki 1 i 2“), polje za upis razmaka i spisak svih razmaka (zadati su označeni). */
function RodGapsEditor({ gaps, given, onSet, onReset }: { gaps: number[]; given?: (number | null)[]; onSet: (index: number, mm: number) => void; onReset: () => void }) {
  const [idx, setIdx] = useState(0);
  const [val, setVal] = useState('');
  if (!gaps.length) return null;
  const i = Math.min(idx, gaps.length - 1);
  const fmt = (v: number) => String(Math.round(v * 10) / 10);
  const num = val === '' ? gaps[i] : Number(val.replace(',', '.'));
  const ok = Number.isFinite(num) && num >= 0;
  const pick = (k: number) => { setIdx(k); setVal(''); };
  const custom = (k: number) => given?.[k] !== null && given?.[k] !== undefined;
  return (
    <div className="rounded-lg border border-line p-2 my-1.5" data-testid="rod-gaps">
      <div className="text-[12px] font-semibold text-muted mb-1">Razmak između pojedinih prečki</div>
      <div className="grid grid-cols-[1fr_1fr] items-end gap-2">
        <label className="text-[12px] text-muted">Između prečki
          <select className="input !py-1 mt-0.5" aria-label="Između kojih prečki" data-testid="rod-gap-pick" value={i} onChange={(e) => pick(Number(e.target.value))}>
            {gaps.map((_, k) => <option key={k} value={k}>{k + 1} i {k + 2}</option>)}
          </select>
        </label>
        <label className="text-[12px] text-muted">Razmak (mm)
          <input className="input !py-1 mt-0.5 tabular-nums" type="number" min={0} step={1} aria-label="Razmak između prečki" data-testid="rod-gap-value" value={val === '' ? fmt(gaps[i]) : val} onChange={(e) => setVal(e.target.value)} />
        </label>
      </div>
      <div className="flex gap-2 mt-2">
        <button className="btn btn-sm btn-primary" disabled={!ok} data-testid="rod-gap-set" onClick={() => { onSet(i, num); setVal(''); if (i < gaps.length - 1) setIdx(i + 1); }}>Dodaj</button>
        <button className="btn btn-sm" disabled={!given?.some((g) => g !== null && g !== undefined)} data-testid="rod-gap-reset" onClick={onReset}>Svi ravnomerno</button>
      </div>
      <ol className="mt-2 text-[12.5px] divide-y divide-line/60" data-testid="rod-gap-list">
        {gaps.map((g, k) => (
          <li key={k}><button type="button" className={`w-full flex justify-between px-1.5 py-0.5 text-left tabular-nums ${k === i ? 'bg-primary-50 font-semibold' : 'hover:bg-slate-50'}`} onClick={() => pick(k)}>
            <span>Prečke {k + 1} i {k + 2}{custom(k) ? ' · zadato' : ''}</span><span>{fmt(g)} mm</span></button></li>
        ))}
      </ol>
    </div>
  );
}

/** Tolerancija konkretnog polja; bez izmene nasleđuje meru iz crteža staklenog modela. */
function GlassToleranceSettings({ id, modelId, params, widthMm, heightMm, stairTan }: { id: string; modelId: FenceModelId; params: FenceParams; widthMm: number; heightMm: number; stairTan: number }) {
  const materials = useAppStore((s) => s.materials);
  const model = customModelOf(modelId); const spec = model?.glassRailing;
  if (!model || !spec?.glassMaterialId) return null;
  const tolerance = params.slats?.glassToleranceMm ?? spec.toleranceMm ?? 0;
  const lift = Math.min(Math.max(0, params.liftMm ?? customLiftOf(modelId)), Math.max(0, heightMm - 100));
  const limits = glassEndLimits(scaledModel(model, widthMm, heightMm - lift, { ...params.slats, stairTan }), { ...spec, toleranceMm: tolerance }, materials, Math.hypot(1, stairTan));
  const setEnd = (key: 'stairGlassStartMm' | 'stairGlassEndMm', value: number) => useAppStore.getState().patchItemParams(id, { slats: { ...params.slats, [key]: value } }, 'stair-glass');
  return <div className="mt-2 rounded-lg border border-line px-3 py-2" data-testid="glass-tolerance-settings">
    <div className="text-[13.5px] font-semibold mb-1">Staklo</div>
    <NumberField label="Tolerancija stakla" testId="field-glass-tolerance" value={params.slats?.glassToleranceMm ?? spec.toleranceMm ?? 0}
      range={{ min: 0, max: 100 }} step={0.5} integer={false} onCommit={(v) => useAppStore.getState().patchItemParams(id, { slats: { ...params.slats, glassToleranceMm: v } }, 'glass-tolerance')}
      hint="2 mm umanjuje širinu za ukupno 2 mm (po 1 mm levo i desno). Visina ostaje ista." />
    <div className="border-t border-line mt-2 pt-2" data-testid="stair-glass-ends">
      {(['start', 'end'] as const).map((side) => {
        const key = side === 'start' ? 'stairGlassStartMm' : 'stairGlassEndMm';
        const label = side === 'start' ? 'Staklo na početku (levo)' : 'Staklo na kraju (desno)';
        const max = limits[side]; const value = params.slats?.[key] ?? 0;
        if (max < limits.min) return <p key={side} className="text-xs text-muted my-2">{label}: nema dovoljno prostora između kraja platna i najbližeg stubića.</p>;
        return <div key={side}>
          <ToggleField label={label} testId={`stair-glass-${side}-on`} checked={value > 0} onChange={(on) => setEnd(key, on ? Math.min(max, Math.max(limits.min, 100)) : 0)} />
          {value > 0 && <NumberField label="Širina stakla" testId={`stair-glass-${side}-width`} value={Math.min(value, max)} range={{ min: limits.min, max }} step={1} integer={false}
            onCommit={(v) => setEnd(key, v)} hint={`Najviše ${fmtNum(max, 1)} mm do najbližeg stubića. ${stairTan ? 'Mera duž nagiba' : 'Širina'}, pre tolerancije. Staklo nose dva držača na tom stubiću.`} />}
        </div>;
      })}
    </div>
  </div>;
}

/** Ograda za terasu, „Raspored prečki“: broj prečki, osa najniže prečke od poda i osa najviše do ose rukohvata; razmak između prečki se računa. */
function TerraceRodSettings({ id, modelId, widthMm, heightMm, params }: { id: string; modelId: FenceModelId; widthMm: number; heightMm: number; params: FenceParams }) {
  const [open, setOpen] = useState(true);
  const st = useAppStore.getState();
  useAppStore((s) => s.materials); // cenovnik menja izgled modela
  const info = customRodInfo(modelId, widthMm, heightMm, params.slats);
  if (!info) return null;
  const set = (patch: NonNullable<FenceParams['slats']>) => st.patchItemParams(id, { slats: { ...params.slats, ...patch } }, 'rods');
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return (
    <div className="mt-2 rounded-lg border border-line" data-testid="rod-settings">
      <button className="w-full flex items-center justify-between px-3 py-2 text-[13.5px] font-semibold" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="rod-settings-toggle">
        Raspored prečki<span className="text-muted text-[12px] font-normal">{open ? 'Sakrij' : 'Prikaži'}</span>
      </button>
      {open && (
        <div className="px-3 pb-2">
          <NumberField label="Broj prečki" testId="rod-count" unit="kom" step={1} value={info.count} range={{ min: 1, max: 40 }} onCommit={(v) => set({ rodCount: Math.round(v) })} />
          <div className="flex items-center justify-between gap-2 py-1" data-testid="rod-gap">
            <span className="text-[13px]">Razmak između prečki</span><b className="tabular-nums text-[13px]">{info.count > 1 ? `${fmtNum(r1(info.gapMm), 1)} mm` : '—'}</b>
          </div>
          <p className="text-[11.5px] text-muted leading-snug -mt-0.5 mb-1">Od ose do ose susednih prečki; prečke su na jednakom razmaku.</p>
          <RodGapsEditor gaps={info.gaps} given={params.slats?.rodGaps} onSet={(i, v) => { const g = Array.from({ length: info.gaps.length }, (_, k) => params.slats?.rodGaps?.[k] ?? null); g[i] = v; set({ rodGaps: g }); }}
            onReset={() => { const { rodGaps: _g, ...rest } = params.slats ?? {}; st.patchItemParams(id, { slats: Object.keys(rest).length ? rest : undefined }, 'rods'); }} />
          <NumberField label="Najniža prečka od poda" testId="rod-bottom" value={r1(info.bottomMm)} range={{ min: 0, max: Math.max(50, Math.round(heightMm)) }} onCommit={(v) => set({ rodBottomMm: v })} hint="Od poda do ose prečke" />
          <NumberField label="Najviša prečka do rukohvata" testId="rod-top" value={r1(info.topMm)} range={{ min: 0, max: Math.max(50, Math.round(heightMm)) }} onCommit={(v) => set({ rodTopMm: v })} hint="Od ose prečke do ose rukohvata" />
        </div>
      )}
    </div>
  );
}

/**
 * Ograda za terasu, „Raspored stubova i razmaci“: najveći razmak između stubova (podrazumevano 1000 mm) i odstojanje prvog i poslednjeg
 * stuba od krajeva polja. Važi za ovo polje; bez izmene važi „Mere ograde“ modela.
 */
function TerracePostSettings({ id, modelId, widthMm, heightMm, params, stairSteps, stairUp }: { id: string; modelId: FenceModelId; widthMm: number; heightMm: number; params: FenceParams; stairSteps?: number; stairUp?: boolean }) {
  const [open, setOpen] = useState(true);
  const materials = useAppStore((s) => s.materials);
  const st = useAppStore.getState();
  const model = customModelOf(modelId);
  const spec = model ? postSpec(model, materials, params.slats) : null;
  if (!model || !spec) return null;
  const xs = params.slats?.postXs ?? postPositions(widthMm, spec);
  const actual = xs.length > 1 ? Math.max(...xs.slice(1).map((x, i) => x - xs[i])) : 0;
  const set = (patch: NonNullable<FenceParams['slats']>) => st.patchItemParams(id, { slats: { ...params.slats, ...patch } }, 'posts');
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return (
    <div className="mt-2 rounded-lg border border-line" data-testid="post-settings">
      <button className="w-full flex items-center justify-between px-3 py-2 text-[13.5px] font-semibold" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="post-settings-toggle">
        Raspored stubova i razmaci<span className="text-muted text-[12px] font-normal">{open ? 'Sakrij' : 'Prikaži'}</span>
      </button>
      {open && (
        <div className="px-3 pb-2">
          {model.terraceSourceId && <SelectField stacked label="Materijal stubova" testId="terrace-post-material"
            value={sharedPostTemplate(model, materials, params.slats?.postMaterialId)?.materialId ?? ''}
            options={sharedPostMaterials(materials).map((m) => ({ value: m.id, label: m.name }))} onChange={(v) => set({ postMaterialId: v })} />}
          <NumberField label="Najveći razmak između stubova" testId="post-spacing" value={r1(spec.spacing)} range={{ min: 100, max: 3000 }} onCommit={(v) => set({ postSpacingMm: v })}
            hint={`Stubova: ${xs.length}, razmak ${Math.round(actual)} mm. Stubovi se ravnomerno raspoređuju, a razmak nije veći od zadatog.`} />
          {params.slats?.freeEnds?.some(Boolean) && (() => {
            const lift = Math.min(Math.max(0, params.liftMm ?? customLiftOf(modelId)), Math.max(0, heightMm - 100));
            const od = customEndOverhang(modelId, widthMm, heightMm - lift, params.slats);
            if (!od) return null;
            const free = params.slats!.freeEnds!;
            const side = free[0] ? od.left : od.right;
            const different = free[0] && free[1] && Math.abs(od.left - od.right) > 0.1;
            return (
              <NumberField label="Od krajnjeg stuba do kraja prečke i rukohvata" testId="post-end-overhang" value={r1(side)} range={{ min: 0, max: Math.max(1000, Math.ceil(side)) }} integer={false} step={1}
                onCommit={(v) => set({ endOverhangMm: v })} hint={`${different ? `Trenutno levo ${fmtNum(od.left, 1)} mm, desno ${fmtNum(od.right, 1)} mm. Unos postavlja oba slobodna kraja. ` : ''}Vodoravna mera od ose krajnjeg stuba. Isto rastojanje za prečke i rukohvat; važi samo za slobodan kraj stepeništa.`} />
            );
          })()}
          {stairSteps ? (
            <>
              {model.terraceSourceId && <NumberField label="Tarabice iznad gazišta" testId="tread-clearance" value={params.slats?.treadClearanceMm ?? 30}
                range={{ min: 0, max: 300 }} onCommit={(v) => set({ treadClearanceMm: v })} hint="Ravan donji rez iznad celog gazišta koje tarabica dodiruje; vrh ostaje uz rukohvat." />}
              <SegmentedField label={stairUp ? 'Prvi stub' : 'Stub na dnu stepeništa'} testId="post-first" value={params.slats?.stairFirstFloor ? 'floor' : 'step'} options={[{ value: 'step', label: 'Na prvom stepeniku' }, { value: 'floor', label: 'Na podu' }]}
                onChange={(v) => set({ stairFirstFloor: v === 'floor' })} />
              {(() => {
                const max = Math.max(1, stairSteps - 1);
                return (
                  <NumberField label="Poslednji stub na stepeniku br." testId="post-last-step" unit="kom" step={1} value={Math.min(max, Math.round(params.slats?.stairLastStep ?? max))} range={{ min: 1, max }}
                    onCommit={(v) => set({ stairLastStep: Math.round(v) })} hint={`Stepenici se broje od dna stepeništa (${stairUp ? 'levo' : 'desno'}), od prvog podignutog stepenika; stub stoji na sredini gazišta. Poslednji stepenik pre vrha je ${max}.`} />
                );
              })()}
            </>
          ) : (
            <>
          <NumberField label="Prvi stub od levog kraja" testId="post-left" value={r1(spec.left)} range={{ min: 0, max: Math.max(0, Math.round(widthMm / 2)) }} onCommit={(v) => set({ postLeftMm: v })} hint="Osa stuba od ivice polja" />
          <NumberField label="Poslednji stub od desnog kraja" testId="post-right" value={r1(spec.right)} range={{ min: 0, max: Math.max(0, Math.round(widthMm / 2)) }} onCommit={(v) => set({ postRightMm: v })} hint="Osa stuba od ivice polja" />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Rotacija polja ograde za terasu: ugao polja prema prethodnom (skretanje trase u osnovi na levom stubu polja). Standardni uglovi i ručni unos.
 * Prvo polje nema prethodno, pa se rotira sledeće. Polja posle skretanja čine nov niz.
 */
function FieldRotation({ project, index }: { project: Project; index: number }) {
  const st = useAppStore.getState();
  const post = project.posts[index];
  if (index <= 0 || !post) return <p className="text-[12px] text-muted mb-2" data-testid="field-rotation-first">Rotacija: prvo polje je polazno, rotirajte sledeće polje.</p>;
  const turn = post.turnDeg ?? 0;
  return (
    <div className="mb-2" data-testid="field-rotation">
      <NumberField label="Rotacija polja" testId="field-rotation-angle" unit="°" step={5} value={turn} range={{ min: -MAX_TURN_DEG, max: MAX_TURN_DEG }}
        onCommit={(v) => st.patchPost(post.id, { turnDeg: v }, 'turn')} hint="Ugao prema prethodnom polju: + udesno, − ulevo (gledano odozgo)" />
      <div className="flex gap-1.5 flex-wrap">
        {[-90, -45, 0, 45, 90].map((a) => (
          <button key={a} className={`btn btn-sm ${turn === a ? 'btn-primary' : ''}`} data-testid={`field-rotation-${a}`} onClick={() => st.patchPost(post.id, { turnDeg: a })}>{a === 0 ? 'Ravno' : `${a > 0 ? '+' : ''}${a}°`}</button>
        ))}
      </div>
    </div>
  );
}

/** Dodaje više istih elemenata odjednom (npr. 10 istih platna): upiše se broj kopija i klikne „Dodaj“. */
function DuplicateMany({ kind }: { kind: string }) {
  const [n, setN] = useState('2');
  const count = Math.floor(Number(n));
  const ok = Number.isFinite(count) && count >= 1 && count <= 50;
  const label = kind === 'fence' ? 'platna' : kind === 'gate' ? 'kapija' : 'elemenata';
  return (
    <div className="flex items-center gap-1.5 mb-2" data-testid="duplicate-many">
      <span className="text-[12.5px] text-muted">Dodaj još</span>
      <input className="input !py-1 !w-16 text-center tabular-nums" type="number" min={1} max={50} step={1} value={n} aria-label={`Broj kopija (${label})`} data-testid="duplicate-count"
        onChange={(e) => setN(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && ok) { e.preventDefault(); useAppStore.getState().duplicateSelected(count); } }} />
      <span className="text-[12.5px] text-muted">istih {label}</span>
      <button className="btn btn-sm btn-primary" disabled={!ok} data-testid="btn-duplicate-many" onClick={() => useAppStore.getState().duplicateSelected(count)}><Copy size={14} />Dodaj</button>
    </div>
  );
}

/** Opseg izmena podešavanja: samo izabrani element, svi iste vrste (sva platna / sve kapije) ili platna i kapije zajedno. */
function ScopeToggle({ project, id, kind, terrace = false }: { project: Project; id: string; kind: 'fence' | 'gate'; terrace?: boolean }) {
  const scope = useAppStore((s) => s.editor.scope ?? 'one');
  const setScope = useAppStore((s) => s.setEditScope);
  const one = kind === 'fence' ? 'Samo ovo platno' : 'Samo ova kapija';
  const same = kind === 'fence' ? 'Sva platna' : 'Sve kapije';
  const count = editScopeTargets(project, id, scope).length;
  return (
    <div className="mb-2" data-testid="edit-scope">
      <ScopeField testId="edit-scope-select" value={scope} onChange={setScope} count={count}
        options={[{ value: 'one', label: one }, { value: 'same', label: same }, { value: 'all', label: terrace ? 'Platna i stepenište' : 'Platna i kapije' }]}
        hint={scope === 'one' ? undefined : 'Izgled i podešavanja ispune važe za obuhvaćene elemente. Između platna i kapija prenose se boja, završna obrada i ispuna; visine se prenose samo unutar iste vrste. Širine i mere kapija ostaju svakom elementu svoje.'} />
    </div>
  );
}
