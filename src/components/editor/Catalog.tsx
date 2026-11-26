import { ChoiceGroup } from '../ui/ChoiceGroup';
import { SearchSelect } from '../ui/SearchSelect';
import { FEATURES } from '../../config/features';
import { allFenceModels } from '../../domain/models/customRegistry';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { defaultModelId, FENCE_MODELS, GATE_LABELS, POST_LABELS, isLightColor, isTerraceModel, projectModelId } from '../../domain/models/catalog';
import { createFence, createGate, createOpening, createProject, DEFAULT_FENCE_HEIGHT_MM, DEFAULT_FENCE_WIDTH_MM, DEFAULT_GATE_HEIGHT_MM } from '../../domain/models/factories';
import { GATE_DEFAULT_WIDTH } from '../../domain/models/catalog';
import { applyPostType, setOuterWidth } from '../../domain/geometry/operations';
import { postHalfSum } from '../../domain/geometry/layout';
import { gateClearWidth, gateFieldsFromModel, gateModelsFor } from '../../domain/gates/gateModels';
import { specFromPreset, type SlidingPresetId } from '../../domain/gates/slidingAssembly';
import type { CustomModel } from '../../domain/models/custom';
import type { FenceModelId, Gate, GateType, PostType, Project } from '../../domain/models/types';
import type { DragSource } from '../../hooks/useDragController';
import { useAppStore, useCurrentProject, type NewElementSpec } from '../../store/useAppStore';
import { FrontView, frontViewMetrics } from './FrontView';

/** Sličica je isti crtež kao u 2D prikazu; za svetle (bele) ograde pozadina je siva kao u editoru da se vidi bela boja. */
export function MiniThumb({ project, width = 150, height = 118, grey = false }: { project: Project; width?: number; height?: number; grey?: boolean }) {
  const m = frontViewMetrics(project, 1, false, true);
  return (
    <div className={`rounded-lg overflow-hidden border border-line pointer-events-none ${grey ? 'bg-[#b3bac3]' : 'bg-white'}`} style={{ width, height }} aria-hidden="true">
      <FrontView project={project} scale={height === 118 ? width / m.vw : Math.min(width / m.vw, height / m.vh)} compact greyBackdrop={grey} className="!w-full !h-full" options={{ showDimensions: false, showGrid: false, showLabels: false }} />
    </div>
  );
}

/** Uzorak polja ograde za sličice: univerzalna početna mera platna (1500 × 1200 mm). */
function sampleFence(model: FenceModelId) {
  return createFence({ modelId: model, widthMm: DEFAULT_FENCE_WIDTH_MM + 100, heightMm: DEFAULT_FENCE_HEIGHT_MM });
}

function useMini(build: () => Project, key: string): Project {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(build, [key]);
}

/** Izbor modela ograde sa slikom platna uz naziv (lakše prepoznavanje modela); prava lista je skrivena i služi za testove i čitače ekrana. */
function ModelDropdown({ model, options, missing, onChange }: { model: FenceModelId; options: { id: string; name: string }[]; missing?: string; onChange: (m: FenceModelId) => void }) {
  const current = options.find((o) => o.id === model)?.name ?? missing ?? FENCE_MODELS[model]?.name ?? model;
  return <div className="min-w-0 w-full sm:w-[360px] max-w-full">
    <select className="sr-only" tabIndex={-1} aria-hidden="true" data-testid="catalog-model" value={model} onChange={(e) => onChange(e.target.value as FenceModelId)}>
      {options.some((m) => m.id === model) ? null : <option value={model} disabled>{missing ?? model}</option>}
      {options.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
    <SearchSelect value={model} onChange={(v) => onChange(v as FenceModelId)} placeholder={current} allowEmpty={false} ariaLabel="Model ograde"
      testId="catalog-model-button" searchPlaceholder="Pretraga modela ograde" leading={<span className="shrink-0"><ElementThumb kind="fence" model={model} size={{ width: 48, height: 38 }} /></span>}
      groups={[{ items: options.map((m) => ({ value: m.id, label: m.name, testId: `catalog-model-option-${m.id}`,
        content: <span className="flex items-center gap-3"><span className="shrink-0"><ElementThumb kind="fence" model={m.id as FenceModelId} size={{ width: 72, height: 54 }} /></span><span>{m.name}</span></span> })) }]} />
  </div>;
}

function CatalogCard({ title, subtitle, thumb, onAdd, onDragStart, testId, addLabel = 'Dodaj', choices, selector }: {
  title: string; subtitle: string; thumb: React.ReactNode; onAdd?: () => void; onDragStart?: (e: React.PointerEvent) => void; testId: string; addLabel?: string;
  /** izbor tipa: umesto jednog dugmeta „Dodaj“ nekoliko dugmadi (npr. ručna / motorna), svako dodaje svoj tip */
  choices?: { label: string; onAdd: () => void; testId: string }[];
  /** izbor između osnovne kapije i mojih modela kapija (samo kad ih ima za izabranu ogradu) */
  selector?: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void };
}) {
  return (
    <div
      data-testid={testId}
      className={`relative shrink-0 w-[172px] flex flex-col rounded-xl border border-line p-2.5 bg-white select-none ${onDragStart ? 'cursor-grab' : ''}`}
      onPointerDown={(e) => { if (e.pointerType === 'mouse' && e.button === 0 && !(e.target as Element).closest('button')) onDragStart?.(e); }}
      // klik na sliku (ili bilo gde na karticu van dugmadi i izbora) ima isti efekat kao dugme „Dodaj“; kartica sa više dugmadi (ručna / motorna) traži izbor
      onClick={(e) => { if ((e.target as Element).closest('button, select, option, a, input')) return; if (onAdd) onAdd(); else if (choices?.length === 1) choices[0].onAdd(); }}
      title={onAdd || choices?.length === 1 ? 'Klik dodaje element' : undefined}
    >
      <div className="flex justify-center">{thumb}</div>
      <div className="mt-2 text-[13px] font-semibold leading-tight">{title}</div>
      <div className="text-[11.5px] text-muted leading-snug min-h-[28px] whitespace-pre-line">{subtitle}</div>
      {selector && (
        <select className="input !py-1 !text-[12px] mt-1 w-full" aria-label={`Tip kapije: ${title}`} data-testid={`${testId}-pick`} value={selector.value} onChange={(e) => selector.onChange(e.target.value)}>
          {selector.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
      <div className="flex items-center gap-1.5 mt-auto pt-1.5">
        {choices
          ? choices.map((c) => <button key={c.testId} className="btn btn-sm btn-primary flex-1 min-w-0 !py-1.5 !px-1 justify-center" onClick={c.onAdd} data-testid={c.testId} title={`${title}: ${c.label}`}>{c.label}</button>)
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
    // stub je iste visine kao ograda (sličica ne prikazuje stub koji viri iznad polja)
    return { ...p, posts: p.posts.map((x) => ({ ...x, heightMm: DEFAULT_FENCE_HEIGHT_MM, heightCustom: true, ...(x.type === 'concrete' || x.type === 'concrete_plinth' ? { widthMm: 220 } : {}) })) };
  }, `p-${type}-${model}`);
  return <CatalogCard testId={`cat-post-${type}`} title={POST_LABELS[type]} subtitle={subtitle} thumb={<MiniThumb project={mini} grey={isLightColor(FENCE_MODELS[model].defaultColor)} />} onAdd={onApply} addLabel={hasSelection ? 'Primeni na stub' : 'Primeni na sve'} />;
}

export type ThumbKind = 'fence' | 'fence-bare' | 'stair' | 'opening' | 'corner' | 'concrete' | GateType;

/** Sličica elementa izabranog modela (ista u katalogu i u prozoru „Dodaj element"), 150 × 118 px: isti crtež kao u 2D prikazu. */
export function ElementThumb({ kind, model, size }: { kind: ThumbKind; model: FenceModelId; size?: { width: number; height: number } }) {
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
    if (kind === 'fence-bare') { const p = createProject('m', [sampleFence(model)]); return { ...p, posts: p.posts.map((x) => ({ ...x, removed: true })) }; }
    return createProject('m', [createGate(kind, { infillModelId: model })]);
  }, `t-${kind}-${model}`);
  if (kind === 'corner') return <CornerThumb grey={grey} />;
  return <MiniThumb project={mini} grey={grey} {...size} />;
}

/** Sličica modela kapije: kapija iz modela između stubova, isti crtež kao u 2D prikazu. */
export function GateModelThumb({ model, size }: { model: CustomModel; size?: { width: number; height: number } }) {
  const ok = model.id in FENCE_MODELS;
  const mini = useMini(() => {
    const g = { ...createGate(model.gate?.gateType ?? 'pedestrian', { infillModelId: (ok ? model.id : defaultModelId()) as FenceModelId }), ...(gateFieldsFromModel(model) as Partial<Gate>) } as Gate;
    const p = createProject('m', [g]);
    return setOuterWidth(p, g.id, gateClearWidth(model) + 2 * postHalfSum(p, 0));
  }, `gm-${model.id}-${model.updatedAt}`);
  return <MiniThumb project={mini} grey={isLightColor(model.color)} {...size} />;
}

/** Sličica klizne kapije (sklop iz polaznih mera varijante), isti crtež kao u 2D prikazu. */
export function SlidingThumb({ preset, model, size }: { preset: SlidingPresetId; size?: { width: number; height: number }; /** model ograde koji je krilo kapije (kao u projektu); bez njega se crta polazno krilo sklopa */ model?: FenceModelId }) {
  const mini = useMini(() => {
    const d = specFromPreset(preset);
    // kapija u projektu: krilo je izabrani model ograde, a sklop daje klizni okov (isto kao pri dodavanju)
    const spec = model ? { ...d.spec, drawnLeaf: true, heightTotal: true } : d.spec;
    const g = createGate('sliding', { sliding: spec, heightMm: d.frameHeight + d.spec.frameBottomY, opening: 'right', automation: spec.actuation === 'motor', ...(model ? { infillModelId: model } : {}) });
    const p = createProject('m', [g]);
    return setOuterWidth(p, g.id, d.frameWidth + 2 * postHalfSum(p, 0));
  }, `sl-${preset}-${model ?? ''}`);
  return <MiniThumb project={mini} grey={model ? isLightColor(FENCE_MODELS[model].defaultColor) : false} {...size} />;
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
 * Katalog elemenata izabranog modela. Prvi red: platno bez stubova, platno sa stubovima, pešačka, jednokrilna, dvokrilna, klizna i samostojeća klizna kapija (klizne sa izborom
 * ručna / motorna). Drugi red: prazan prostor, aluminijumski i betonski stub (podnožje stuba se zadaje u podešavanjima stuba). Posebni modeli i šabloni
 * kapija se ne nude ovde (nalaze se na stranici Modeli kapija). Model se bira jednom (menja se na svim elementima projekta).
 */
export function Catalog({ onBeginDrag }: { onBeginDrag: (source: DragSource, e: { clientX: number; clientY: number }) => void }) {
  const storeModel = useAppStore((s) => s.editor.activeModelId);
  const project = useCurrentProject();
  const model = (project && projectModelId(project.items)) ?? storeModel; // ograda koju projekat već ima
  const { addElement, mutate } = useAppStore.getState();
  const selection = useAppStore((s) => s.editor.selection);
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
  // moji modeli kapija nacrtani od izabrane ograde: padajući meni uz osnovnu kapiju; podrazumevana je unapred izabrana
  const customModels = useAppStore((s) => s.settings.customModels);
  const [gatePick, setGatePick] = useState<Record<string, string>>({});
  const gateSelector = (cardId: string, type: GateType, support?: 'ground_rail' | 'cantilever') => {
    const mine = gateModelsFor(customModels, type, model, support);
    if (!mine.length) return { chosen: null as string | null, selector: undefined };
    const value = gatePick[cardId] ?? mine.find((m) => m.gateDefault)?.id ?? '';
    const chosen = mine.some((m) => m.id === value) ? value : '';
    return { chosen: chosen || null, selector: { value: chosen, options: [{ value: '', label: 'Osnovna kapija' }, ...mine.map((m) => ({ value: m.id, label: m.name }))], onChange: (v: string) => setGatePick((x) => ({ ...x, [cardId]: v })) } };
  };

  return (
    <section className="card p-3" data-testid="catalog" aria-label="Katalog elemenata">
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <div className="flex flex-wrap items-center gap-2 min-w-0 w-full text-sm font-medium">
          <span>Model ograde</span>
          {FEATURES.terraceFences && (
            <ChoiceGroup label="Vrsta ograde" testId="fence-family" value={terrace ? 'terrace' : 'yard'}
              options={[{ value: 'yard', label: 'Dvorište', testId: 'family-yard' }, { value: 'terrace', label: 'Terasa', testId: 'family-terrace' }]}
              onChange={(fam) => {
                if ((fam === 'terrace') === terrace) return;
                const first = allFenceModels(undefined, fam)[0];
                if (first) changeModel(first.id as FenceModelId);
                else useAppStore.getState().setNotice(fam === 'terrace' ? 'Nema modela ograda za terase. Nacrtajte ih na stranici Modeli ograda za terase.' : 'Nema modela ograda za dvorište. Nacrtajte ih na stranici Modeli ograda.');
              }} />
          )}
          <ModelDropdown model={model} options={allFenceModels(model)} missing={`${def.name} (nije na stranici Modeli ograda)`} onChange={changeModel} />
        </div>
      </div>
      <div className="space-y-3" data-testid="catalog-items">
        {/* prvi red: platno i kapije */}
        <div className="flex flex-wrap gap-3" data-testid="catalog-row-elements">
          {!terrace && (
            <CatalogCard testId="cat-fence-bare" title="Platno" subtitle={`Samo platno, bez stubova
${DEFAULT_FENCE_WIDTH_MM} × ${DEFAULT_FENCE_HEIGHT_MM} mm`} thumb={<ElementThumb kind="fence-bare" model={model} />}
              onAdd={() => addElement({ kind: 'fence', modelId: model, noPosts: true })} onDragStart={startDrag({ kind: 'fence', modelId: model, noPosts: true }, `Platno bez stubova — ${def.name}`)} />
          )}
          <CatalogCard testId="cat-fence" title={terrace ? 'Platno' : 'Platno sa stubovima'} subtitle={`${def.name}${terrace ? '' : `
${DEFAULT_FENCE_WIDTH_MM} × ${DEFAULT_FENCE_HEIGHT_MM} mm`}`} thumb={<ElementThumb kind="fence" model={model} />} onAdd={() => addElement({ kind: 'fence', modelId: model })} onDragStart={startDrag({ kind: 'fence', modelId: model }, `Platno — ${def.name}`)} />
          {terrace && (
            <CatalogCard testId="cat-fence-angled" title="Platno pod uglom" subtitle="Sledeće platno skreće: ugao se upisuje u polju „Rotacija polja“" thumb={<ElementThumb kind="fence" model={model} />}
              onAdd={() => addElement({ kind: 'fence', modelId: model, turnDeg: 90 })} onDragStart={startDrag({ kind: 'fence', modelId: model, turnDeg: 90 }, 'Platno pod uglom')} />
          )}
          {terrace && (
            <CatalogCard testId="cat-stair" title="Stepenište" subtitle="Ograda koja prati stepenice" thumb={<ElementThumb kind="stair" model={model} />}
              onAdd={() => addElement({ kind: 'fence', modelId: model, stair: true })} onDragStart={startDrag({ kind: 'fence', modelId: model, stair: true }, 'Stepenište')} />
          )}
          {!terrace && GATE_CARDS.filter((g) => !hidden?.includes(`gate:${g.type}`)).map((g) => {
            const { chosen, selector } = gateSelector(g.id, g.type);
            const spec: NewElementSpec = chosen ? { kind: 'gate', gateType: g.type, gateModelId: chosen } : { kind: 'gate', gateType: g.type, modelId: model };
            return (
              <CatalogCard key={g.id} testId={`cat-gate-${g.id}`} selector={selector} title={g.title} subtitle={`${g.subtitle}
${GATE_DEFAULT_WIDTH[g.type]} × ${DEFAULT_GATE_HEIGHT_MM} mm`} thumb={<ElementThumb kind={g.type} model={model} />}
                onAdd={() => addElement(spec)} onDragStart={startDrag(spec, g.title)} />
            );
          })}
          {!terrace && SLIDING_CARDS.filter((c) => visiblePreset(c.manual) || visiblePreset(c.motor)).map((c) => {
            const { chosen, selector } = gateSelector(c.id, 'sliding', c.id === 'sliding' ? 'ground_rail' : 'cantilever');
            return (
            <CatalogCard key={c.id} testId={`cat-gate-${c.id}`} selector={selector} title={c.title} subtitle={c.subtitle} thumb={<SlidingThumb preset={c.thumb} model={model} />}
              choices={chosen ? [{ label: 'Dodaj', testId: `cat-sliding-${c.id}-model-add`, onAdd: () => useAppStore.getState().addGateFromModel(chosen) }] : [
                ...(visiblePreset(c.manual) ? [{ label: 'Ručna', testId: `cat-sliding-${c.manual}-add`, onAdd: () => useAppStore.getState().addSlidingGate({ preset: c.manual }) }] : []),
                ...(visiblePreset(c.motor) ? [{ label: 'Motorna', testId: `cat-sliding-${c.motor}-add`, onAdd: () => useAppStore.getState().addSlidingGate({ preset: c.motor }) }] : []),
              ]} />
            );
          })}
        </div>
        {/* drugi red: prazan prostor i stubovi */}
        <div className="flex flex-wrap gap-3" data-testid="catalog-row-posts">
          <CatalogCard testId="cat-opening" title="Prazan prostor" subtitle="Slobodan prostor bez ispune" thumb={<ElementThumb kind="opening" model={model} />} onAdd={() => addElement({ kind: 'opening' })} onDragStart={startDrag({ kind: 'opening' }, 'Prazan prostor')} />
          {!terrace && POST_TYPES.map((t) => (
            <PostCard key={t.type} type={t.type} subtitle={t.subtitle} model={model} hasSelection={selection?.type === 'post'} onApply={() => applyPost(t.type)} />
          ))}
        </div>
      </div>
      {terrace && <p className="text-[12.5px] text-muted mt-3" data-testid="catalog-terrace-note">Ograda za terasu nema kapije ni zasebne stubove: stubovi su deo ograde.</p>}
      {/* ugaoni spoj se ne nudi: ugao se pravi na stubu ograde (ugao skretanja stuba) */}
    </section>
  );
}
