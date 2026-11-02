import { useMemo, useState } from 'react';
import { heightRangeFor, LIMITS, validateRange, widthRangeFor } from '../../domain/validation/limits';
import type { Project } from '../../domain/models/types';
import { computeLayout, outerWidthMm, postHalfSum } from '../../domain/geometry/layout';
import { setOuterWidth, setTotalLength } from '../../domain/geometry/operations';
import { GATE_LABELS } from '../../domain/models/catalog';
import { itemLabel } from '../../utils/labels';
import { useAppStore } from '../../store/useAppStore';
import { Modal } from '../ui/Modal';

export type DimKind = 'width' | 'height' | 'total';

/**
 * Izmena mere sa kote: širina elementa (ukupna, sa stubovima), visina, ili ukupna dužina cele ograde —
 * tada se razlika raspoređuje na polja ograde i otvore, a kapije ostaju iste.
 */
export function DimEditModal({ project, id, kind, onClose }: { project: Project; id: string; kind: DimKind; onClose: () => void }) {
  const items = project.items;
  const index = items.findIndex((i) => i.id === id);
  const item = items[index];
  const occupied = computeLayout(project).occupiedMm;
  const [text, setText] = useState(String(kind === 'total' ? Math.round(occupied) : kind === 'width' ? Math.round(outerWidthMm(project, index)) : item?.heightMm));
  const value = Number(text);

  // ukupna dužina: proba raspodele unapred, da se odmah vidi da li polja mogu da stanu
  const totalTry = useMemo(() => (kind === 'total' && value > 0 ? setTotalLength(project, value) : null), [kind, project, value]);

  if (kind !== 'total' && !item) return null;
  const half = kind === 'width' ? postHalfSum(project, index) : 0;
  const base = kind === 'total' ? LIMITS.fixedTotal : kind === 'width' ? widthRangeFor(item) : heightRangeFor(item);
  const range = kind === 'width' ? { min: Math.round(base.min + half), max: Math.round(base.max + half) } : base;
  const label = kind === 'height' ? 'Visina' : kind === 'total' ? 'Ukupna dužina' : 'Širina';
  const rangeCheck = validateRange(value, range, label);
  const error = !rangeCheck.ok ? rangeCheck.message : totalTry?.reason;
  const ok = !error;
  const name = kind === 'total' ? 'Cela ograda — sva polja ograde dobijaju istu dužinu, kapije i otvori ostaju isti'
    : item.kind === 'gate' ? GATE_LABELS[item.gateType] : item.kind === 'opening' ? (item.bendDeg !== undefined ? 'Ugaoni spoj' : 'Prazan otvor') : itemLabel(items, index);

  const apply = () => {
    if (!ok) return;
    const st = useAppStore.getState();
    if (kind === 'total') st.mutate((p) => setTotalLength(p, Math.round(value)).project);
    else if (kind === 'width') st.mutate((p) => setOuterWidth(p, id, Math.round(value)));
    else st.patchItem(id, { heightMm: Math.round(value) });
    onClose();
  };
  return (
    <Modal
      title={kind === 'total' ? 'Izmena ukupne dužine' : kind === 'width' ? 'Izmena širine' : 'Izmena visine'}
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
