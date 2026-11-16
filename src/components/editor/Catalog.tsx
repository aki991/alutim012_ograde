import { allFenceModels } from '../../domain/models/customRegistry';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { DEFAULT_MODEL_ID, FENCE_MODELS, GATE_LABELS, POST_LABELS, isLightColor, isTerraceModel, projectModelId } from '../../domain/models/catalog';
import { createFence, createGate, createOpening, createProject } from '../../domain/models/factories';
import { applyPostType, setOuterWidth } from '../../domain/geometry/operations';
import { postHalfSum } from '../../domain/geometry/layout';
import { gateClearWidth, gateFieldsFromModel, GATE_TYPE_LABELS } from '../../domain/gates/gateModels';
import { presetTitle, specFromPreset, type SlidingPresetId } from '../../domain/gates/slidingAssembly';
import type { CustomModel } from '../../domain/models/custom';
import type { FenceModelId, Gate, GateType, PostType, Project, SlidingTemplate } from '../../domain/models/types';
import type { DragSource } from '../../hooks/useDragController';
import { useAppStore, useCurrentProject, type NewElementSpec } from '../../store/useAppStore';
import { FrontView, frontViewMetrics } from './FrontView';

/** Sličica je isti crtež kao u 2D prikazu; za svetle (bele) ograde pozadina je siva kao u editoru da se vidi bela boja. */
export function MiniThumb({ project, width = 150, grey = false }: { project: Project; width?: number; grey?: boolean }) {
  const m = frontViewMetrics(project, 1, false, true);
  return (
    <div className={`rounded-lg overflow-hidden border border-line pointer-events-none ${grey ? 'bg-[#b3bac3]' : 'bg-white'}`} style={{ width, height: 118 }} aria-hidden="true">
      <FrontView project={project} scale={width / m.vw} compact greyBackdrop={grey} className="!w-full !h-full" options={{ showDimensions: false, showGrid: false, showLabels: false }} />
    </div>
  );
}

/** Uzorak polja ograde izabranog modela za sličice: veličina polja modela (tarabica: 6 tarabica), inače 1800 × 1200 mm. */
function sampleFence(model: FenceModelId) {
  const size = FENCE_MODELS[model].defaultSize;
  return createFence({ modelId: model, widthMm: size ? (size.clearWidth ? size.widthMm : size.widthMm - 100) : 1800, heightMm: size?.heightMm ?? 1200 });
}

function useMini(build: () => Project, key: string): Project {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(build, [key]);
}

function CatalogCard({ title, subtitle, thumb, onAdd, onDragStart, testId, addLabel = 'Dodaj', choices }: {
  title: string; subtitle: string; thumb: React.ReactNode; onAdd?: () => void; onDragStart?: (e: React.PointerEvent) => void; testId: string; addLabel?: string;
  /** izbor tipa: umesto jednog dugmeta „Dodaj“ nekoliko dugmadi (npr. ručna / motorna), svako dodaje svoj tip */
  choices?: { label: string; onAdd: () => void; testId: string }[];
}) {
  return (
    <div
      data-testid={testId}
      className={`relative shrink-0 w-[172px] flex flex-col rounded-xl border border-line p-2.5 bg-white select-none ${onDragStart ? 'cursor-grab' : ''}`}
      onPointerDown={(e) => { if (e.pointerType === 'mouse' && e.button === 0 && !(e.target as Element).closest('button')) onDragStart?.(e); }}
    >
      <div className="flex justify-center">{thumb}</div>
      <div className="mt-2 text-[13px] font-semibold leading-tight">{title}</div>
      <div className="text-[11.5px] text-muted leading-snug min-h-[28px]">{subtitle}</div>
      <div className="flex items-center gap-1.5 mt-auto pt-1.5">
        {choices
          ? choices.map((c) => <button key={c.testId} className="btn btn-sm btn-primary flex-1 !py-1.5 !px-1.5" onClick={c.onAdd} data-testid={c.testId} title={`${title}: ${c.label}`}><Plus size={14} />{c.label}</button>)
          : <button className="btn btn-sm btn-primary w-full !py-1.5" onClick={onAdd} data-testid={`${testId}-add`}><Plus size={14} />{addLabel}</button>}
      </div>
    </div>
  );
}

/** stubovi koji se nude u katalogu; betonski stub sa podnožjem se bira u podešavanjima stuba (tip) */
const POST_TYPES: { type: PostType; subtitle: string }[] = [
  { type: 'aluminium', subtitle: 'Standardni stub uz ogradu' },
  { type: 'concrete', subtitle: 'Betonski stub' },
];

function CornerThumb({ grey = false }: { grey?: boolean }) {
  return (
    <div className={`rounded-lg overflow-hidden border border-line pointer-events-none grid place-items-center ${grey ? 'bg-[#b3bac3]' : 'bg-white'}`} style={{ width: 150, height: 118 }} aria-hidden="true">
      <svg viewBox="0 0 150 118" width="150" height="118">
        <path d="M18 78 H78 L112 38" fill="none" stroke="#1a1a1a" strokeWidth="5" strokeLinejoin="round" />
        <path d="M18 62 H74 L100 30" fill="none" stroke="#1a1a1a" strokeWidth="3" strokeLinejoin="round" opacity="0.55" />
        <rect x="14" y="52" width="9" height="34" fill="#9aa3ad" /><rect x="70" y="44" width="9" height="40" fill="#9aa3ad" /><rect x="104" y="30" width="9" height="30" fill="#9aa3ad" />
      </svg>
    </div>
  );
}

function PostCard({ type, subtitle, model, hasSelection, onApply }: { type: PostType; subtitle: string; model: FenceModelId; hasSelection: boolean; onApply: () => void }) {
  const mini = useMini(() => {
    const p = applyPostType(createProject('m', [sampleFence(model)]), type);
    return { ...p, posts: p.posts.map((x) => (x.type === 'concrete' || x.type === 'concrete_plinth' ? { ...x, widthMm: 220 } : x)) };
  }, `p-${type}-${model}`);
  return <CatalogCard testId={`cat-post-${type}`} title={POST_LABELS[type]} subtitle={subtitle} thumb={<MiniThumb project={mini} grey={isLightColor(FENCE_MODELS[model].defaultColor)} />} onAdd={onApply} addLabel={hasSelection ? 'Primeni na stub' : 'Primeni na sve'} />;
}

export type ThumbKind = 'fence' | 'stair' | 'opening' | 'corner' | 'concrete' | GateType;

/** Sličica elementa izabranog modela (ista u katalogu i u prozoru „Dodaj element"), 150 × 118 px: isti crtež kao u 2D prikazu. */
export function ElementThumb({ kind, model }: { kind: ThumbKind; model: FenceModelId }) {
  const def = FENCE_MODELS[model];
  const grey = isLightColor(def.defaultColor);
  const mini = useMini(() => {
    if (kind === 'opening') return createProject('m', [createOpening({ widthMm: 1600, heightMm: 1200 })]);
    if (kind === 'concrete') {
      const p = createProject('m', [createGate('single', { infillModelId: model })]);
      return { ...p, posts: p.posts.map((x) => ({ ...x, type: 'concrete' as const, widthMm: 220 })) };
    }
    if (kind === 'stair') return createProject('m', [createFence({ modelId: model, widthMm: 2400, heightMm: 800, stair: { riseMm: 700 } })]);
    if (kind === 'fence' || kind === 'corner') return createProject('m', [sampleFence(model)]);
    return createProject('m', [createGate(kind, { infillModelId: model })]);
  }, `t-${kind}-${model}`);
  if (kind === 'corner') return <CornerThumb grey={grey} />;
  return <MiniThumb project={mini} grey={grey} />;
}

/** Sličica modela kapije: kapija iz modela između stubova, isti crtež kao u 2D prikazu. */
export function GateModelThumb({ model }: { model: CustomModel }) {
  const ok = model.id in FENCE_MODELS;
  const mini = useMini(() => {
    const g = { ...createGate(model.gate?.gateType ?? 'pedestrian', { infillModelId: (ok ? model.id : DEFAULT_MODEL_ID) as FenceModelId }), ...(gateFieldsFromModel(model) as Partial<Gate>) } as Gate;
    const p = createProject('m', [g]);
    return setOuterWidth(p, g.id, gateClearWidth(model) + 2 * postHalfSum(p, 0));
  }, `gm-${model.id}-${model.updatedAt}`);
  return <MiniThumb project={mini} grey={isLightColor(model.color)} />;
}

/** Sličica klizne kapije (sklop iz polaznih mera varijante ili šablona), isti crtež kao u 2D prikazu. */
export function SlidingThumb({ preset, template }: { preset?: SlidingPresetId; template?: SlidingTemplate }) {
  const mini = useMini(() => {
    const d = preset ? specFromPreset(preset) : null;
    const spec = d?.spec ?? template!.spec;
    const g = createGate('sliding', { sliding: spec, heightMm: d ? d.frameHeight + d.spec.frameBottomY : template!.heightMm, opening: template?.opening ?? 'right', automation: spec.actuation === 'motor', ...(template ? { color: template.color } : {}) });
    const p = createProject('m', [g]);
    return setOuterWidth(p, g.id, (d?.frameWidth ?? template!.frameWidth) + 2 * postHalfSum(p, 0));
  }, preset ? `sl-${preset}` : `sl-${template!.id}-${JSON.stringify([template!.spec, template!.frameWidth, template!.heightMm, template!.opening, template!.color])}`);
  return <MiniThumb project={mini} />;
}

/** kapije sa krilima, redom kako se nude u katalogu (klizne su posebne kartice sa izborom tipa) */
const GATE_CARDS: { id: string; type: GateType; title: string; subtitle: string }[] = [
  { id: 'pedestrian', type: 'pedestrian', title: GATE_LABELS.pedestrian, subtitle: 'Za prolaz ljudi' },
  { id: 'single', type: 'single', title: GATE_LABELS.single, subtitle: 'Jedno krilo' },
  { id: 'double', type: 'double', title: GATE_LABELS.double, subtitle: 'Dva krila' },
];

/** klizne kapije: dve kartice, svaka sa izborom ručna / motorna */
const SLIDING_CARDS: { id: string; title: string; subtitle: string; thumb: SlidingPresetId; manual: SlidingPresetId; motor: SlidingPresetId }[] = [
  { id: 'sliding', title: 'Klizna kapija', subtitle: 'Klizi po šini u podu', thumb: 'klizna_sina_rucna', manual: 'klizna_sina_rucna', motor: 'klizna_sina_motorna' },
  { id: 'sliding-self', title: 'Samostojeća klizna kapija', subtitle: 'Samonoseća, kolica i rep, bez šine', thumb: 'samonoseca_rucna', manual: 'samonoseca_rucna', motor: 'samonoseca_motorna' },
];

/**
 * Katalog elemenata izabranog modela. Prvi red: platno, pešačka, jednokrilna, dvokrilna, klizna i samostojeća klizna kapija (klizne sa izborom
 * ručna / motorna). Drugi red: prazan prostor, aluminijumski i betonski stub (podnožje stuba se zadaje u podešavanjima stuba). Posebni modeli i šabloni
 * kapija (ako ih ima) su u trećem redu. Model se bira jednom (menja se na svim elementima projekta).
 */
export function Catalog({ onBeginDrag }: { onBeginDrag: (source: DragSource, e: { clientX: number; clientY: number }) => void }) {
  const storeModel = useAppStore((s) => s.editor.activeModelId);
  const project = useCurrentProject();
  const model = (project && projectModelId(project.items)) ?? storeModel; // ograda koju projekat već ima
  const { addElement, mutate } = useAppStore.getState();
  const selection = useAppStore((s) => s.editor.selection);
  const customModels = useAppStore((s) => s.settings.customModels);
  const gateModels = customModels?.filter((m) => m.kind === 'gate' && !m.replaces);
  const slidingTemplates = useAppStore((s) => s.settings.slidingTemplates);
  const hidden = useAppStore((s) => s.settings.hiddenModels);
  const def = FENCE_MODELS[model];
  const terrace = isTerraceModel(model); // ograda za terasu: bez kapija i bez kataloga stubova

  const startDrag = (spec: NewElementSpec, label: string) => (e: React.PointerEvent) => onBeginDrag({ kind: 'new', spec, label }, e);

  const changeModel = (m: FenceModelId) => {
    const st = useAppStore.getState();
    if (project && project.items.length > 0) st.setItemModel('', m); // isti model na celoj ogradi
    else st.setActiveModel(m);
  };
  const applyPost = (type: PostType) => mutate((p) => applyPostType(p, type, selection?.type === 'post' ? selection.id : undefined));
  const visiblePreset = (id: SlidingPresetId) => !hidden?.includes(`gate:slide:${id}`);
  const hasOwnRow = !terrace && ((gateModels?.length ?? 0) > 0 || (slidingTemplates?.length ?? 0) > 0);

  return (
    <section className="card p-3" data-testid="catalog" aria-label="Katalog elemenata">
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          Model ograde
          <select className="input !w-auto !py-1.5 min-w-[260px]" data-testid="catalog-model" value={model} onChange={(e) => changeModel(e.target.value as FenceModelId)}>
            {allFenceModels(model).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
      </div>
      <div className="space-y-3" data-testid="catalog-items">
        {/* prvi red: platno i kapije */}
        <div className="flex flex-wrap gap-3" data-testid="catalog-row-elements">
          <CatalogCard testId="cat-fence" title="Platno" subtitle={def.name} thumb={<ElementThumb kind="fence" model={model} />} onAdd={() => addElement({ kind: 'fence', modelId: model })} onDragStart={startDrag({ kind: 'fence', modelId: model }, `Platno — ${def.name}`)} />
          {terrace && (
            <CatalogCard testId="cat-stair" title="Stepenište" subtitle="Ograda koja prati stepenice" thumb={<ElementThumb kind="stair" model={model} />}
              onAdd={() => addElement({ kind: 'fence', modelId: model, stair: true })} onDragStart={startDrag({ kind: 'fence', modelId: model, stair: true }, 'Stepenište')} />
          )}
          {!terrace && GATE_CARDS.filter((g) => !hidden?.includes(`gate:${g.type}`)).map((g) => {
            const spec: NewElementSpec = { kind: 'gate', gateType: g.type, modelId: model };
            return (
              <CatalogCard key={g.id} testId={`cat-gate-${g.id}`} title={g.title} subtitle={g.subtitle} thumb={<ElementThumb kind={g.type} model={model} />}
                onAdd={() => addElement(spec)} onDragStart={startDrag(spec, g.title)} />
            );
          })}
          {!terrace && SLIDING_CARDS.filter((c) => visiblePreset(c.manual) || visiblePreset(c.motor)).map((c) => (
            <CatalogCard key={c.id} testId={`cat-gate-${c.id}`} title={c.title} subtitle={c.subtitle} thumb={<SlidingThumb preset={c.thumb} />}
              choices={[
                ...(visiblePreset(c.manual) ? [{ label: 'Ručna', testId: `cat-sliding-${c.manual}-add`, onAdd: () => useAppStore.getState().addSlidingGate({ preset: c.manual }) }] : []),
                ...(visiblePreset(c.motor) ? [{ label: 'Motorna', testId: `cat-sliding-${c.motor}-add`, onAdd: () => useAppStore.getState().addSlidingGate({ preset: c.motor }) }] : []),
              ]} />
          ))}
        </div>
        {/* drugi red: prazan prostor i stubovi */}
        <div className="flex flex-wrap gap-3" data-testid="catalog-row-posts">
          <CatalogCard testId="cat-opening" title="Prazan prostor" subtitle="Slobodan prostor bez ispune" thumb={<ElementThumb kind="opening" model={model} />} onAdd={() => addElement({ kind: 'opening' })} onDragStart={startDrag({ kind: 'opening' }, 'Prazan prostor')} />
          {!terrace && POST_TYPES.map((t) => (
            <PostCard key={t.type} type={t.type} subtitle={t.subtitle} model={model} hasSelection={selection?.type === 'post'} onApply={() => applyPost(t.type)} />
          ))}
        </div>
        {/* treći red (samo ako postoje): modeli kapija i šabloni klizne kapije iz podešavanja */}
        {hasOwnRow && (
          <div data-testid="catalog-row-custom">
            <h3 className="font-semibold text-[13px] mb-2 text-muted">Moji modeli i šabloni kapija</h3>
            <div className="flex flex-wrap gap-3">
              {slidingTemplates?.map((t) => (
                <CatalogCard key={t.id} testId={`cat-slidingtpl-${t.id}`} title={t.name} subtitle={`Moj šablon · ${presetTitle(t.spec.presetId) === 'Klizna kapija' ? 'klizna kapija' : presetTitle(t.spec.presetId)}`} thumb={<SlidingThumb template={t} />}
                  onAdd={() => useAppStore.getState().addSlidingGate({ template: t.id })} />
              ))}
              {gateModels?.map((m) => (
                <CatalogCard key={m.id} testId={`cat-gatemodel-${m.id}`} title={m.name} subtitle={`Model kapije · ${GATE_TYPE_LABELS[m.gate?.gateType ?? 'pedestrian']}`} thumb={<GateModelThumb model={m} />}
                  onAdd={() => useAppStore.getState().addGateFromModel(m.id)} />
              ))}
            </div>
          </div>
        )}
      </div>
      {terrace && <p className="text-[12.5px] text-muted mt-3" data-testid="catalog-terrace-note">Ograda za terasu nema kapije ni zasebne stubove: stubovi su deo ograde.</p>}
      {/* ugaoni spoj se ne nudi: ugao se pravi na stubu ograde (ugao skretanja stuba) */}
    </section>
  );
}
