import { useMemo, useState } from 'react';
import { heightRangeFor, LIMITS, validateRange, widthRangeFor } from '../../domain/validation/limits';
import type { Project } from '../../domain/models/types';
import { computeLayout, outerWidthMm, postHalfSum } from '../../domain/geometry/layout';
import { setAllPostHeights, setHeightsOfKind, setOuterWidth, setTotalLength } from '../../domain/geometry/operations';
import { GATE_LABELS } from '../../domain/models/catalog';
import { itemLabel } from '../../utils/labels';
import { useAppStore } from '../../store/useAppStore';
import { Modal } from '../ui/Modal';

/**
 * 'width' = spoljna širina elementa (sa stubovima), 'clear' = platno (svetla širina između stubova),
 * 'height-fence' / 'height-post' / 'height-gate' = visina svih platna / svih stubova / svih kapija (leve kote)
 */
export type DimKind = 'width' | 'clear' | 'height-fence' | 'height-post' | 'height-gate' | 'total';

/**
 * Izmena mere sa kote: širina elementa (ukupna, sa stubovima), visina, ili ukupna dužina cele ograde —
 * tada se razlika raspoređuje na polja ograde i otvore, a kapije ostaju iste.
 */
export function DimEditModal({ project, id, kind, onClose }: { project: Project; id: string; kind: DimKind; onClose: () => void }) {
  if (kind === 'height-fence' || kind === 'height-post' || kind === 'height-gate') return <HeightEditModal project={project} kind={kind} onClose={onClose} />;
  return <SizeEditModal project={project} id={id} kind={kind} onClose={onClose} />;
}

function SizeEditModal({ project, id, kind, onClose }: { project: Project; id: string; kind: 'width' | 'clear' | 'total'; onClose: () => void }) {
  const items = project.items;
  const index = items.findIndex((i) => i.id === id);
  const item = items[index];
  const laid = computeLayout(project);
  const occupied = laid.occupiedMm;
  // platno: razlika spoljne i svetle širine ostaje ista (to su stubovi), pa se menja spoljna širina za isti iznos
  const postsMm = kind === 'clear' && index >= 0 ? Math.round(outerWidthMm(project, index) - (laid.items[index]?.clearWidth ?? 0)) : 0;
  const [text, setText] = useState(String(kind === 'total' ? Math.round(occupied) : kind === 'width' ? Math.round(outerWidthMm(project, index)) : Math.round(outerWidthMm(project, index)) - postsMm));
  const value = Number(text);

  // ukupna dužina: proba raspodele unapred, da se odmah vidi da li polja mogu da stanu
  const totalTry = useMemo(() => (kind === 'total' && value > 0 ? setTotalLength(project, value) : null), [kind, project, value]);

  if (kind !== 'total' && !item) return null;
  const wide = kind === 'width' || kind === 'clear';
  const half = wide ? postHalfSum(project, index) : 0;
  const base = kind === 'total' ? LIMITS.fixedTotal : widthRangeFor(item);
  const range = wide ? { min: Math.max(1, Math.round(base.min + half) - postsMm), max: Math.round(base.max + half) - postsMm } : base;
  const label = kind === 'total' ? 'Ukupna dužina' : kind === 'clear' ? 'Širina platna (između stubova)' : 'Širina';
  const rangeCheck = validateRange(value, range, label);
  const error = !rangeCheck.ok ? rangeCheck.message : totalTry?.reason;
  const ok = !error;
  const name = kind === 'total' ? 'Cela ograda — sva polja ograde dobijaju istu dužinu, kapije i otvori ostaju isti'
    : item.kind === 'gate' ? GATE_LABELS[item.gateType] : item.kind === 'opening' ? (item.bendDeg !== undefined ? 'Ugaoni spoj' : 'Prazan otvor') : itemLabel(items, index);

  const apply = () => {
    if (!ok) return;
    const st = useAppStore.getState();
    if (kind === 'total') st.mutate((p) => setTotalLength(p, Math.round(value)).project);
    else st.mutate((p) => setOuterWidth(p, id, Math.round(value) + postsMm));
    onClose();
  };
  return (
    <Modal
      title={kind === 'total' ? 'Izmena ukupne dužine' : kind === 'clear' ? 'Izmena širine platna' : 'Izmena širine'}
      width={420}
      onClose={onClose}
      footer={<div className="flex justify-end gap-2 w-full"><button className="btn" onClick={onClose}>Otkaži</button><button className="btn btn-primary" data-testid="dim-apply" disabled={!ok} onClick={apply}>Primeni</button></div>}
    >
      <div data-testid="dim-edit">
        <div className="text-sm text-muted mb-2">{name}</div>
        <label className="grid gap-1">
          <span className="label">{label} (mm) — dozvoljeno {range.min}–{range.max}</span>
          <input
            className="input !text-lg tabular-nums" type="number" inputMode="numeric" data-autofocus data-testid="dim-input" aria-invalid={!ok}
            value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }}
          />
        </label>
        {error && <p className="text-[13px] text-[#b42318] mt-1.5" role="alert" data-testid="dim-error">{error}</p>}
      </div>
    </Modal>
  );
}

const HEIGHT_TEXT = {
  'height-fence': { title: 'Visina svih platna', name: 'Sva platna ograde dobijaju istu visinu', what: 'Visina platna' },
  'height-post': { title: 'Visina svih stubova', name: 'Svi stubovi dobijaju isti vrh (visina od poda do vrha stuba); stub više ne prati visinu ograde dok se ne vrati automatska visina', what: 'Visina stubova' },
  'height-gate': { title: 'Visina svih kapija', name: 'Sve kapije dobijaju istu visinu; platna i stubovi se ne menjaju', what: 'Visina kapija' },
} as const;

/** Izmena visine celog skupa: svih platna, svih stubova ili svih kapija (leve kote crteža). */
function HeightEditModal({ project, kind, onClose }: { project: Project; kind: 'height-fence' | 'height-post' | 'height-gate'; onClose: () => void }) {
  const laid = computeLayout(project);
  const posts = laid.posts.filter((lp) => !lp.hidden);
  const items = project.items.filter((i) => i.kind === (kind === 'height-gate' ? 'gate' : 'fence'));
  const current = kind === 'height-post' ? Math.max(0, ...posts.map((lp) => lp.topMm)) : Math.max(0, ...items.map((i) => i.heightMm));
  const [text, setText] = useState(String(Math.round(current)));
  const value = Number(text);
  // dozvoljeni opseg: presek opsega svih elemenata; kod stubova se visina iznad podnožja računa od ukupne
  const range = useMemo(() => {
    if (kind === 'height-post') {
      const levels = laid.posts.map((lp) => lp.levelMm);
      return { min: LIMITS.postHeight.min + Math.max(0, ...levels), max: LIMITS.postHeight.max + Math.min(...levels, Infinity) };
    }
    const rs = items.map((i) => heightRangeFor(i));
    return { min: Math.max(...rs.map((r) => r.min)), max: Math.min(...rs.map((r) => r.max)) };
  }, [kind, laid, items]);
  const t = HEIGHT_TEXT[kind];
  const check = validateRange(value, range, t.what);
  const ok = check.ok;
  const apply = () => {
    if (!ok) return;
    const st = useAppStore.getState();
    const v = Math.round(value);
    if (kind === 'height-post') st.mutate((p) => setAllPostHeights(p, v));
    else st.mutate((p) => setHeightsOfKind(p, kind === 'height-gate' ? 'gate' : 'fence', v));
    onClose();
  };
  return (
    <Modal title={t.title} width={420} onClose={onClose}
      footer={<div className="flex justify-end gap-2 w-full"><button className="btn" onClick={onClose}>Otkaži</button><button className="btn btn-primary" data-testid="dim-apply" disabled={!ok} onClick={apply}>Primeni</button></div>}>
      <div data-testid="dim-edit">
        <div className="text-sm text-muted mb-2">{t.name}</div>
        <label className="grid gap-1">
          <span className="label">{t.what} (mm) — dozvoljeno {range.min}–{range.max}</span>
          <input className="input !text-lg tabular-nums" type="number" inputMode="numeric" data-autofocus data-testid="dim-input" aria-invalid={!ok} value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }} />
        </label>
        {!check.ok && <p className="text-[13px] text-[#b42318] mt-1.5" role="alert" data-testid="dim-error">{check.message}</p>}
      </div>
    </Modal>
  );
}
