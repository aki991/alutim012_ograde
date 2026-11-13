import { allFenceModels } from '../../domain/models/customRegistry';
import { ChevronRight } from 'lucide-react';
import { ElementThumb, type ThumbKind } from './Catalog';
import { useState } from 'react';
import { newItemFor, type NewItemSpec } from '../../domain/geometry/newItem';
import { applyPostType, insertItem, setOuterWidth, withConcretePosts } from '../../domain/geometry/operations';
import { FENCE_MODELS, GATE_LABELS, isTerraceModel, projectModelId } from '../../domain/models/catalog';
import { createCorner, createFence, createGate, createOpening } from '../../domain/models/factories';
import type { FenceModelId, GateType, LayoutItem, Project } from '../../domain/models/types';
import { heightRangeFor, validateRange, widthRangeFor } from '../../domain/validation/limits';
import { useAppStore } from '../../store/useAppStore';
import { Modal } from '../ui/Modal';

interface Kind { id: string; label: string; hint: string; thumb: ThumbKind; concrete?: true; gate?: GateType; fence?: true; opening?: true; corner?: true }
const KINDS: Kind[] = [
  { id: 'fence', label: 'Platno', hint: 'Platno ograde izabranog modela', thumb: 'fence', fence: true },
  { id: 'pedestrian', label: 'Pešačka kapija', hint: 'Kapija za prolaz ljudi', thumb: 'pedestrian', gate: 'pedestrian' },
  { id: 'single', label: 'Jednokrilna kapija', hint: 'Jedno krilo', thumb: 'single', gate: 'single' },
  { id: 'double', label: 'Dvokrilna kapija', hint: 'Dva krila', thumb: 'double', gate: 'double' },
  { id: 'sliding', label: 'Klizna kapija', hint: 'Kapija na klizanje', thumb: 'sliding', gate: 'sliding' },
  { id: 'concrete', label: 'Kapija sa betonskim stubom', hint: 'Jednokrilna kapija između betonskih stubova', thumb: 'concrete', gate: 'single', concrete: true },
  { id: 'opening', label: 'Prazan otvor', hint: 'Slobodan prostor bez ispune', thumb: 'opening', opening: true },
];

const specOf = (k: Kind, m: FenceModelId): NewItemSpec => (k.gate ? { kind: 'gate', gateType: k.gate, modelId: m } : k.corner ? { kind: 'corner' } : k.opening ? { kind: 'opening' } : { kind: 'fence', modelId: m });

const buildItem = (k: Kind, modelId: FenceModelId, widthMm: number, heightMm: number, bendDeg: number): LayoutItem => {
  if (k.gate) return createGate(k.gate, { widthMm, heightMm, infillModelId: modelId });
  if (k.corner) return createCorner({ heightMm, bendDeg });
  if (k.opening) return createOpening({ widthMm, heightMm });
  return createFence({ modelId, widthMm, heightMm });
};

/** Dugme „+" na kraju niza: izbor sledećeg elementa (ograda, kapije, otvor, ugaoni spoj), pa mere i tip novog krajnjeg stuba. */
export function AddItemModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const [kind, setKind] = useState<Kind | null>(null);
  const activeModel = useAppStore((s) => s.editor.activeModelId);
  const projectModel = projectModelId(project.items); // projekat ima jedan model: nudi se samo on
  const [model, setModel] = useState<FenceModelId>(projectModel ?? activeModel);
  const [width, setWidth] = useState('2000');
  const [height, setHeight] = useState(String(project.settings.defaultHeightMm));
  const [bend, setBend] = useState('90');
  const [post, setPost] = useState<'auto' | 'concrete' | 'aluminium'>('auto');

  const selection = useAppStore((s) => s.editor.selection);
  const selectedId = selection?.type === 'item' ? selection.id : null;
  // mere novog elementa: kao ograda koja je već u projektu (izabrano polje, inače poslednja ograda)
  const pick = (k: Kind) => {
    setKind(k);
    const { item, outerWidthMm } = newItemFor(project, specOf(k, model), model, selectedId);
    setWidth(String(Math.round(outerWidthMm)));
    setHeight(String(Math.round(item.heightMm)));
  };

  if (!kind) {
    return (
      <Modal title="Dodaj element" width={460} onClose={onClose}>
        <ul className="grid gap-1.5" data-testid="add-menu">
          {KINDS.filter((k) => !k.gate || !isTerraceModel(activeModel)).map((k) => (
            <li key={k.id}>
              <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-line bg-white hover:bg-[#fdf0f0] hover:border-primary text-left" data-testid={`add-kind-${k.id}`} onClick={() => pick(k)}>
                <span className="shrink-0 overflow-hidden rounded-lg" style={{ width: 90, height: 71 }}>
                  <span className="block origin-top-left" style={{ transform: 'scale(0.6)', width: 150, height: 118 }}><ElementThumb kind={k.thumb} model={model} /></span>
                </span>
                <span className="flex-1"><span className="block font-semibold text-[14px]">{k.label}</span><span className="block text-[12px] text-muted">{k.hint}</span></span>
                <ChevronRight size={16} className="text-muted" />
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    );
  }

  const sample = buildItem(kind, model, 2000, 1600, 90);
  // zadata dužina je spoljna (zauzeta): granice se pomeraju za polovine stubova (procena iz širine poslednjeg i novog stuba)
  const half = ((project.posts[project.posts.length - 1]?.widthMm ?? 100) + (kind.gate ? 120 : 100)) / 2;
  const base = widthRangeFor(sample);
  const range = { min: Math.round(base.min + half), max: Math.round(base.max + half) };
  const wCheck = kind.corner ? { ok: true as boolean, message: undefined as string | undefined } : validateRange(Number(width), range, 'Dužina');
  const hCheck = validateRange(Number(height), heightRangeFor(sample), 'Visina');
  const bCheck = kind.corner ? validateRange(Number(bend), { min: -180, max: 180 }, 'Ugao', '°') : { ok: true as boolean, message: undefined as string | undefined };
  const ok = wCheck.ok && hCheck.ok && bCheck.ok && (!kind.corner || Number(bend) !== 0);

  const add = () => {
    if (!ok) return;
    const base = newItemFor(project, specOf(kind, model), model, selectedId).item;
    const item = (kind.corner ? { ...base, bendDeg: Number(bend) } : { ...base, widthMm: Math.round(Number(width)), heightMm: Math.round(Number(height)) }) as LayoutItem;
    const postChoice = kind.fence && isTerraceModel(model) ? 'auto' : post; // stubovi ograde za terasu su deo ograde
    const st = useAppStore.getState();
    if (kind.fence || kind.gate) st.setActiveModel(model);
    st.mutate((p) => {
      let q = insertItem(p, item, p.items.length);
      if (kind.concrete) q = withConcretePosts(q, item.id);
      else if (postChoice !== 'auto') q = applyPostType(q, postChoice, q.posts[q.posts.length - 1].id);
      return setOuterWidth(q, item.id, item.widthMm);
    });
    st.select({ type: 'item', id: item.id });
    onClose();
  };

  return (
    <Modal
      title={`Dodaj: ${kind.label}`}
      width={420}
      onClose={onClose}
      footer={<div className="flex justify-between w-full"><button className="btn" onClick={() => setKind(null)}>Nazad</button><button className="btn btn-primary" data-testid="add-apply" disabled={!ok} onClick={add}>Dodaj</button></div>}
    >
      <div className="grid gap-3" data-testid="add-form" onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); add(); } }}>
        {(kind.fence || kind.gate) && !projectModel && (
          <label className="grid gap-1"><span className="label">Model ispune</span>
            <select className="input" data-testid="add-model" value={model} onChange={(e) => setModel(e.target.value as FenceModelId)}>
              {allFenceModels().filter((m) => !kind.gate || !isTerraceModel(m.id)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        )}
        {kind.corner ? (
          <label className="grid gap-1"><span className="label">Ugao savijanja (°): + udesno, − ulevo</span>
            <input className="input" type="number" step={5} data-autofocus data-testid="add-bend" value={bend} onChange={(e) => setBend(e.target.value)} aria-invalid={!bCheck.ok} />
            {!bCheck.ok && <span className="text-[13px] text-[#b42318]" role="alert">{bCheck.message}</span>}
          </label>
        ) : (
          <label className="grid gap-1"><span className="label">Ukupna dužina elementa (mm) — {range.min}–{range.max}</span>
            <input className="input tabular-nums" type="number" data-autofocus data-testid="add-width" value={width} onChange={(e) => setWidth(e.target.value)} aria-invalid={!wCheck.ok} />
            {!wCheck.ok && <span className="text-[13px] text-[#b42318]" role="alert" data-testid="add-error">{wCheck.message}</span>}
          </label>
        )}
        <label className="grid gap-1"><span className="label">Željena visina (mm)</span>
          <input className="input tabular-nums" type="number" data-testid="add-height" value={height} onChange={(e) => setHeight(e.target.value)} aria-invalid={!hCheck.ok} />
          {!hCheck.ok && <span className="text-[13px] text-[#b42318]" role="alert">{hCheck.message}</span>}
        </label>
        {!kind.concrete && !(kind.fence && isTerraceModel(model)) && (
        <div className="grid gap-1"><span className="label">Tip novog krajnjeg stuba</span>
          <div className="flex gap-1.5">
            {([['auto', 'Kao ostali'], ['concrete', 'Betonski'], ['aluminium', 'Aluminijumski']] as const).map(([v, label]) => (
              <button key={v} type="button" className={`btn btn-sm flex-1 ${post === v ? 'btn-primary' : ''}`} aria-pressed={post === v} data-testid={`add-post-${v}`} onClick={() => setPost(v)}>{label}</button>
            ))}
          </div>
        </div>
        )}
        <p className="text-[12px] text-muted">Element se dodaje na kraj niza ({kind.gate ? GATE_LABELS[kind.gate] : kind.fence ? FENCE_MODELS[model].name : kind.label}).</p>
      </div>
    </Modal>
  );
}
