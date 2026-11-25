import { useState } from 'react';
import { cornerCutLimits, type CornerCut } from '../../domain/models/cornerCut';
import { customLiftOf, isCustomModel } from '../../domain/models/customRegistry';
import type { FenceModelId, FenceParams } from '../../domain/models/types';
import { useAppStore } from '../../store/useAppStore';
import { NumberField } from '../forms/Fields';
import { ChoiceGroup } from '../ui/ChoiceGroup';

type Side = 'none' | CornerCut['side'];

/**
 * Odsečen gornji ugao polja (kosina na kraju ograde, npr. uz stepenište ili krov): bira se ugao i dve mere kosine. Crtež, krojna lista
 * i radni nalog polja se računaju iz istih isečenih delova.
 */
export function CornerCutSettings({ id, modelId, widthMm, heightMm, params }: { id: string; modelId: FenceModelId; widthMm: number; heightMm: number; params: FenceParams }) {
  const cut = params.slats?.cornerCut;
  const [open, setOpen] = useState(!!cut);
  if (!isCustomModel(modelId)) return null;
  const st = useAppStore.getState();
  const inner = heightMm - (params.liftMm ?? customLiftOf(modelId));
  const { maxDrop, maxIn } = cornerCutLimits(widthMm, inner);
  const set = (next: CornerCut | undefined) => {
    const { cornerCut: _c, ...rest } = params.slats ?? {};
    st.patchItemParams(id, { slats: next ? { ...rest, cornerCut: next } : Object.keys(rest).length ? rest : undefined }, 'corner-cut');
  };
  const side: Side = cut?.side ?? 'none';
  const pick = (s: Side) => set(s === 'none' ? undefined : { side: s, dropMm: cut?.dropMm ?? Math.min(maxDrop, Math.round(inner * 0.25)), inMm: cut?.inMm ?? Math.min(maxIn, Math.round(widthMm * 0.3)) });
  return (
    <div className="mt-2 rounded-lg border border-line" data-testid="corner-cut-settings">
      <button className="w-full flex items-center justify-between px-3 py-2 text-[13.5px] font-semibold" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="corner-cut-toggle">
        <span>Odsečen gornji ugao{cut ? <span className="ml-1.5 text-primary">· {cut.side === 'left' ? 'levi' : 'desni'}</span> : null}</span>
        <span className="text-muted text-[12px] font-normal">{open ? 'Sakrij' : 'Prikaži'}</span>
      </button>
      {open && (
        <div className="px-3 pb-2">
          <ChoiceGroup label="Ugao (pogled sa ulice)" value={side} onChange={pick} testId="corner-cut-side"
            options={[{ value: 'none', label: 'Bez' }, { value: 'left', label: 'Levi' }, { value: 'right', label: 'Desni' }]} />
          {cut && <>
            <NumberField label="Spušteno na ivici" testId="corner-cut-drop" value={Math.min(cut.dropMm, maxDrop)} range={{ min: 10, max: maxDrop }}
              onCommit={(v) => set({ ...cut, dropMm: v })} hint="Koliko je vrh polja niži na samoj ivici, mereno od vrha ispune." />
            <NumberField label="Početak kosine od ivice" testId="corner-cut-in" value={Math.min(cut.inMm, maxIn)} range={{ min: 10, max: maxIn }}
              onCommit={(v) => set({ ...cut, inMm: v })} hint="Vodoravno od ivice polja do mesta gde vrh počinje da pada." />
            <p className="text-[11.5px] text-muted mt-1">Bočni profil se nastavlja kosim profilom istog materijala, a ispuna se seče po kosini. Krojna lista i radni nalog prate isečene delove.</p>
          </>}
        </div>
      )}
    </div>
  );
}
