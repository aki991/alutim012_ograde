import { allFenceModels } from '../../domain/models/customRegistry';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FENCE_MODELS, GATE_LABELS, POST_LABELS, isLightColor, isTerraceModel, projectModelId } from '../../domain/models/catalog';
import { createFence, createGate, createOpening, createProject } from '../../domain/models/factories';
import { applyPostType } from '../../domain/geometry/operations';
import type { FenceModelId, GateType, PostType, Project } from '../../domain/models/types';
import type { DragSource } from '../../hooks/useDragController';
import { useAppStore, useCurrentProject, type NewElementSpec } from '../../store/useAppStore';
import { FrontView, frontViewMetrics } from './FrontView';

/** Sličica je isti crtež kao u 2D prikazu; za svetle (bele) ograde pozadina je siva kao u editoru da se vidi bela boja. */
function MiniThumb({ project, width = 150, grey = false }: { project: Project; width?: number; grey?: boolean }) {
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

function CatalogCard({ title, subtitle, thumb, onAdd, onDragStart, testId, addLabel = 'Dodaj' }: {
  title: string; subtitle: string; thumb: React.ReactNode; onAdd: () => void; onDragStart?: (e: React.PointerEvent) => void; testId: string; addLabel?: string;
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
        <button className="btn btn-sm btn-primary w-full !py-1.5" onClick={onAdd} data-testid={`${testId}-add`}><Plus size={14} />{addLabel}</button>
      </div>
    </div>
  );
}

const POST_TYPES: { type: PostType; subtitle: string }[] = [
  { type: 'aluminium', subtitle: 'Standardni stub uz ogradu' },
  { type: 'concrete', subtitle: 'Betonski stub' },
  { type: 'concrete_plinth', subtitle: 'Betonski stub sa podnožjem ispod ograde' },
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

const GATE_CARDS: { id: string; type: GateType; concrete?: boolean; title: string; subtitle: string }[] = [
  { id: 'pedestrian', type: 'pedestrian', title: GATE_LABELS.pedestrian, subtitle: 'Za prolaz ljudi' },
  { id: 'sliding', type: 'sliding', title: GATE_LABELS.sliding, subtitle: 'Otvara se klizanjem u stranu' },
  { id: 'double', type: 'double', title: GATE_LABELS.double, subtitle: 'Dva krila' },
  { id: 'single', type: 'single', title: GATE_LABELS.single, subtitle: 'Jedno krilo' },
];

/**
 * Katalog elemenata izabranog modela: ograda, kapije, kapija sa betonskim stubom i prazan otvor — sve odjednom otvoreno.
 * Model se bira jednom (menja se na svim elementima projekta), pa nema ni kartica za svaki model ni kategorija.
 */
export function Catalog({ onBeginDrag }: { onBeginDrag: (source: DragSource, e: { clientX: number; clientY: number }) => void }) {
  const storeModel = useAppStore((s) => s.editor.activeModelId);
  const project = useCurrentProject();
  const model = (project && projectModelId(project.items)) ?? storeModel; // ograda koju projekat već ima
  const { addElement, mutate } = useAppStore.getState();
  const selection = useAppStore((s) => s.editor.selection);
  const [showAll, setShowAll] = useState(false);
  const def = FENCE_MODELS[model];
  const terrace = isTerraceModel(model); // ograda za terasu: bez kapija i bez kataloga stubova
  // tarabica: svi stubovi i podnožje su uvek na raspolaganju (betonski stub sa podnožjem, samo podnožje)
  const postsAlways = !terrace && def.style === 'tarabica';

  const startDrag = (spec: NewElementSpec, label: string) => (e: React.PointerEvent) => onBeginDrag({ kind: 'new', spec, label }, e);
  const postsBlock = !terrace && (
    <div data-testid="catalog-posts">
      <h3 className="font-semibold text-[14px] mt-4 mb-2">Stubovi</h3>
      <div className="flex flex-wrap gap-3">
        <CatalogCard testId="cat-gate-concrete" title="Kapija sa betonskim stubom" subtitle="Jednokrilna kapija između betonskih stubova" thumb={<ElementThumb kind="concrete" model={model} />}
          onAdd={() => addElement({ kind: 'gate', gateType: 'single', modelId: model, concrete: true })} onDragStart={startDrag({ kind: 'gate', gateType: 'single', modelId: model, concrete: true }, 'Kapija sa betonskim stubom')} />
        {POST_TYPES.map((t) => (
          <PostCard key={t.type} type={t.type} subtitle={t.subtitle} model={model} hasSelection={selection?.type === 'post'}
            onApply={() => mutate((p) => applyPostType(p, t.type, selection?.type === 'post' ? selection.id : undefined))} />
        ))}
      </div>
    </div>
  );

  const changeModel = (m: FenceModelId) => {
    const st = useAppStore.getState();
    if (project && project.items.length > 0) st.setItemModel('', m); // isti model na celoj ogradi
    else st.setActiveModel(m);
  };

  return (
    <section className="card p-3" data-testid="catalog" aria-label="Katalog elemenata">
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          Model ograde
          <select className="input !w-auto !py-1.5 min-w-[260px]" data-testid="catalog-model" value={model} onChange={(e) => changeModel(e.target.value as FenceModelId)}>
            {allFenceModels().map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <button className="btn btn-sm ml-auto" aria-expanded={showAll} data-testid="catalog-show-all" onClick={() => setShowAll((v) => !v)}>
          {showAll ? <><ChevronUp size={15} />Prikaži najčešće</> : <><ChevronDown size={15} />Prikaži sve</>}
        </button>
      </div>
      <div className="flex flex-wrap gap-3" data-testid="catalog-items">
        <CatalogCard testId="cat-fence" title="Ograda" subtitle={def.name} thumb={<ElementThumb kind="fence" model={model} />} onAdd={() => addElement({ kind: 'fence', modelId: model })} onDragStart={startDrag({ kind: 'fence', modelId: model }, `Ograda — ${def.name}`)} />
        {!terrace && GATE_CARDS.map((g) => {
          const spec: NewElementSpec = { kind: 'gate', gateType: g.type, modelId: model, concrete: g.concrete };
          return (
            <CatalogCard
              key={g.id} testId={`cat-gate-${g.id}`} title={g.title} subtitle={g.subtitle}
              thumb={<ElementThumb kind={g.concrete ? 'concrete' : g.type} model={model} />}
              onAdd={() => addElement(spec)} onDragStart={startDrag(spec, g.title)}
            />
          );
        })}
        {terrace && (
          <CatalogCard testId="cat-stair" title="Stepenište" subtitle="Ograda koja prati stepenice" thumb={<ElementThumb kind="stair" model={model} />}
            onAdd={() => addElement({ kind: 'fence', modelId: model, stair: true })} onDragStart={startDrag({ kind: 'fence', modelId: model, stair: true }, 'Stepenište')} />
        )}
        <CatalogCard testId="cat-opening" title="Prazan otvor" subtitle="Slobodan prostor bez ispune" thumb={<ElementThumb kind="opening" model={model} />} onAdd={() => addElement({ kind: 'opening' })} onDragStart={startDrag({ kind: 'opening' }, 'Prazan otvor')} />
      </div>
      {terrace && <p className="text-[12.5px] text-muted mt-3" data-testid="catalog-terrace-note">Ograda za terasu nema kapije ni zasebne stubove: stubovi su deo ograde.</p>}
      {postsAlways && postsBlock}
      {showAll && (
        <div data-testid="catalog-all">
          <h3 className="font-semibold text-[14px] mt-4 mb-2">Uglovi</h3>
          <div className="flex flex-wrap gap-3">
            <CatalogCard testId="cat-corner" title="Ugaoni spoj" subtitle="Prečke i rukohvat se savijaju između dva stuba" thumb={<CornerThumb grey={isLightColor(def.defaultColor)} />} onAdd={() => addElement({ kind: 'corner' })} onDragStart={startDrag({ kind: 'corner' }, 'Ugaoni spoj')} />
          </div>
          {!postsAlways && postsBlock}
        </div>
      )}
    </section>
  );
}
